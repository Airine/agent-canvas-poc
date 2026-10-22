// Upstream components are imported verbatim from a separately acquired checkout.
// This file adapts the host only. No Electron or PI Desktop runtime is started.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { en, flattenCatalog } from '@pi-desktop/i18n';
import { ChatTranscript } from '@upstream/features/chat/transcript/ChatTranscript';
import { TranscriptDisclosureProvider } from '@upstream/features/chat/transcript/disclosure';
import { Composer } from '@upstream/components/Composer';
import { useAppStore } from '@upstream/stores/app-store';
import { projectPiMessages } from './pi-projection';
import type { SessionView } from '../api/e/contracts';
import { capabilityAvailable } from '../api/e/contracts';
import { guardCardFocus } from './focus-guard';
import { createPiFileHost, confirmPermission } from './pi-host';
import { validateMessage } from '../shared/message-content.mjs';

guardCardFocus();

const params = new URLSearchParams(location.search);
const wid = params.get('workspace'), nid = params.get('node');
if (!wid || !nid) throw new Error('A workspace and node are required');
const base = `/api/workspaces/${encodeURIComponent(wid)}/nodes/${encodeURIComponent(nid)}`;
let view: SessionView | undefined, readOnly = true, online = false;
let bindings: Record<string, {approval: {id: string; toolCallId?: string; reason?: string}; digest: string; complete: boolean; tool: string; args?: unknown}> = {};
const note = (s: string) => { document.getElementById('native-status')!.textContent = s; };
const unsupported = () => { throw new Error('This desktop service is not connected to e/Pi yet. No action was performed.'); };
const files = createPiFileHost(`${wid}/${nid}`);
window.piDesktop = {
  platform: 'darwin', locale: 'en',
  invoke: async (channel: string, input: Record<string, unknown>) => {
    try {
      if (channel === 'pi-desktop/fs/readImageDataUrl' && typeof input?.ref === 'string' && input.ref.startsWith('canvas-message/')) {
        const [,id,index] = input.ref.split('/');
        const block = view?.snapshot?.messages.find(m => m.id === id)?.blocks[Number(index)];
        if (block?.type !== 'image' || !['image/png','image/jpeg','image/webp'].includes(String(block.mimeType))) throw new Error('Image not found');
        return {ok:true,data:{kind:'image',dataUrl:`data:${block.mimeType};base64,${block.data}`}};
      }
      return {ok:true, data:await files.invoke(channel, input?.sessionId === nid ? {...input,sessionId:`${wid}/${nid}`} : input)};
    }
    catch (error) { return {ok:false,error:{code:'HOST_ERROR',message:String(error)}}; }
  },
  on: () => () => {}, getDroppedFilePath: () => null,
} as typeof window.piDesktop;
async function request(suffix: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(`${base}/${suffix}`, {method,
    headers: {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (['rejected', 'outcome-unknown'].includes(data.action?.state)) throw new Error(`${data.action.state}: ${data.action.reason ?? 'not automatically retried'}`);
  return data;
}
function writable() {
  if (!online || readOnly || view?.lifecycle !== 'ready') throw new Error('Session unavailable. Restore the session before sending.');
}
async function send(content: string, draft: unknown, target: string | undefined, onAccepted?: (id: string) => void, deliverAs = 'nextTurn') {
  try {
    writable();
    note('');
    if (target && target !== nid) throw new Error('Cross-card submission rejected');
    const refs = (draft as {fileReferences?: Array<{path:string;name:string}>})?.fileReferences ?? [];
    const attachments = await Promise.all(refs.map(ref => files.read(ref.path)));
    for (const ref of refs) content = content.replaceAll(`@${ref.path}`, `[attachment: ${ref.name}]`);
    validateMessage(content, attachments, view?.configuration?.model?.input.includes('image') ?? false);
    await request('messages', {intentId: crypto.randomUUID(), content, attachments, deliverAs});
    onAccepted?.(nid!); await refresh(); return true;
  } catch (error) { note(String(error)); return false; }
}
useAppStore.setState({
  activeSessionId: nid, page: 'chat', messages: [], retainedSessionIds: [nid], retainedTranscripts: {[nid]: []},
  showToast: (s: string) => note(s),
  sendPrompt: send,
  steerPrompt: (content, draft, target, onAccepted) => send(content, draft, target, onAccepted, 'steer'),
  resolvePermission: async (session, requestId, decision) => {
    writable();
    if (session !== nid) throw new Error('Cross-card approval rejected');
    if (decision === 'allow-session') throw new Error('Session-wide grants are not supported here. Choose Allow once or Deny.');
    const binding = bindings[requestId];
    if (!binding) throw new Error('Approval changed; inspect the current request.');
    if (decision === 'allow-once' && !binding.complete) throw new Error('Complete tool parameters are required before approval.');
    await request('approval', {intentId: crypto.randomUUID(), approvalId: binding.approval.id,
      expectedApprovalDigest: binding.digest, decision: decision === 'allow-once' ? 'approved' : 'rejected'});
    await refresh();
  },
  abort: async () => { writable(); await request('abort', {intentId: crypto.randomUUID(), targetRunId: view?.snapshot?.runs.find(r => r.state === 'running')?.id}); },
  loadProviderModels: async () => {},
  configureActiveSession: async change => {
    writable();
    if (change.mode && change.mode !== 'agent') throw new Error('Plan/goal modes are not connected to e/Pi.');
    if (change.permissionMode) {
      const modes = {ask:'manual', 'accept-edits':'edits', auto:'full'} as const;
      const mode = modes[change.permissionMode as keyof typeof modes];
      if (!mode) throw new Error('Unsupported permission mode');
      if (mode !== 'manual' && !await confirmPermission(mode === 'edits'
        ? 'Allow bounded project file edits automatically? Shell commands, sensitive paths and large/unsafe changes still require approval. Resets on runtime restart.'
        : 'Automatically approve all tools in this running session? Tools can execute commands, change or delete files. This is not a sandbox. Resets on runtime restart.')) return;
      await request('approval-mode', {mode,confirmRisk:mode!=='manual'}, 'PATCH');
    } else {
      const config = view?.configuration;
      if (!config) throw new Error('Runtime configuration unavailable');
      const provider = change.providerId ?? config.model?.provider;
      const model = change.modelId ?? config.model?.id;
      const switching = model !== config.model?.id || provider !== config.model?.provider;
      if (!switching && !new Set<string>(config.thinkingLevels).has(change.thinkingLevel ?? '')) throw new Error('Choose an explicit reasoning level supported by this runtime.');
      await request('configuration', {intentId:crypto.randomUUID(),expectedRevision:config.revision,
        ...(switching ? {provider,model} : {thinkingLevel:change.thinkingLevel})});
    }
    await refresh();
  },
  queuePrompt: async () => unsupported(),
});
let refreshing: Promise<void> | undefined;
let projectedVersion = -1, projectedReadOnly = true;
function refresh(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const data = await request('native-state');
    if (data.session.nodeId !== nid || data.session.workspaceId !== wid) throw new Error('Session identity mismatch');
    view = data.session; readOnly = data.readOnly; online = true;
    const current = view!;
    if (current.version === projectedVersion && readOnly === projectedReadOnly) return;
    projectedVersion = current.version; projectedReadOnly = readOnly;
    const messages = projectPiMessages(current);
    bindings = Object.fromEntries(data.approvals.map((b: typeof bindings[string]) => [`${b.approval.id}:${b.digest}`, b]));
    const running = !!current.snapshot?.runs.some(r => r.state === 'running');
    const available = current.lifecycle === 'ready' && !readOnly;
    const config = current.configuration;
    const providers = [...new Set(config?.models.map(m => m.provider) ?? [])].map(id => ({
      id, name:id, enabled:true, authKind:'none', hasSecret:false,
      models:config!.models.filter(m => m.provider === id).map(m => ({id:m.id,alias:m.name, supportsVision:m.input.includes('image'),thinkingLevels:m.id === config?.model?.id && m.provider === config.model.provider ? config.thinkingLevels : []})),
      supportsReasoning:true, supportedThinkingLevels:config?.thinkingLevels ?? [],
    }));
    const modelId = current.configuration?.model?.id ?? current.ref.model ?? 'runtime';
    useAppStore.setState({
      messages, retainedTranscripts: {[nid!]: messages}, isRunning: running,
      providers, providerModels:Object.fromEntries(providers.map(p => [p.id,config!.models.filter(m => m.provider === p.id).map(m => ({providerId:p.id,modelId:m.id,displayName:m.name??m.id,capabilities:m.input,contextWindow:m.contextWindow,source:'user'}))])),
      sessions: [{id: nid, source: 'desktop', title: current.title, messageCount: messages.length,
        projectPath: current.ref.cwd, modelId, providerId: current.ref.provider, mode: 'agent',
        thinkingLevel: config?.thinkingLevel ?? 'off', supportsReasoning:!!config?.thinkingLevels.length, supportedThinkingLevels:config?.thinkingLevels ?? [],
        permissionMode: current.approvalMode === 'full' ? 'auto' : current.approvalMode === 'edits' ? 'accept-edits' : 'ask',
        capabilities: {canPrompt: available && capabilityAvailable(current, 'send.user-message'),
          canStop: available && capabilityAvailable(current, 'abort'), canRefresh:true, canAttach:available,
          canConfigureModel: available && !running && !current.configurationPending && !!config && capabilityAvailable(current,'model.switch'),
          canUseLocalTools:false,canUseTerminal:false,canEditMessages:false,canReadWorkspace:false,canSteer:false},
        createdAt: current.updatedAt, updatedAt: current.updatedAt}],
      pendingPermissions: {[nid!]: Object.entries(bindings).map(([requestId, b]) => ({
        sessionId: nid, requestId, toolCallId: b.approval.toolCallId, toolName: b.tool,
        argsPreview: b.args, risk: 'high', reason: b.approval.reason ?? 'e/Pi requires approval. Allow once authorizes only this exact pending operation.',
      }))},
    });
    document.getElementById('native-resume')!.hidden = current.lifecycle === 'ready' || current.lifecycle === 'starting';
    document.getElementById('native-stop')!.hidden = current.lifecycle !== 'ready';
    document.getElementById('native-lifecycle')!.textContent = `${current.lifecycle} · ${modelId}`;
  })().catch(error => { online = false; note(String(error)); }).finally(() => { refreshing = undefined; });
  return refreshing;
}
for (const action of ['resume', 'stop']) document.getElementById(`native-${action}`)!.onclick = async () => {
  try { note(`${action}…`); await request(action, {}); await refresh(); note(''); } catch (error) { note(String(error)); }
};
// Standalone esbuild entry, not a Vite fast-refresh module.
// eslint-disable-next-line react-refresh/only-export-components
function NativePi() {
  const state = useAppStore();
  return <div className="chat-surface" style={{height: '100%', minWidth: 0}}>
    <TranscriptDisclosureProvider><ChatTranscript sessionId={nid!} messages={state.messages} isRunning={state.isRunning}
      pendingPermission={state.pendingPermissions[nid!]?.[0]} queuedPermissions={Math.max(0, (state.pendingPermissions[nid!]?.length ?? 0) - 1)} /></TranscriptDisclosureProvider>
    <Composer />
  </div>;
}
document.documentElement.dataset.theme = 'light'; document.documentElement.dataset.platform = 'darwin';
const i18n = createInstance();
await i18n.init({lng: 'en', fallbackLng: 'en', resources: {en: {translation: flattenCatalog(en)}}, interpolation: {escapeValue: false}});
createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18n}><NativePi /></I18nextProvider>);
async function poll() { await refresh(); setTimeout(poll, view?.snapshot?.runs.some(r => r.state === 'running') ? 350 : 1200); }
void poll();

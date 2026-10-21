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

guardCardFocus();

const params = new URLSearchParams(location.search);
const wid = params.get('workspace'), nid = params.get('node');
if (!wid || !nid) throw new Error('A workspace and node are required');
const base = `/api/workspaces/${encodeURIComponent(wid)}/nodes/${encodeURIComponent(nid)}`;
let view: SessionView | undefined, readOnly = true, online = false;
let bindings: Record<string, {approval: {id: string; toolCallId?: string; reason?: string}; digest: string; complete: boolean; tool: string; args?: unknown}> = {};
const note = (s: string) => { document.getElementById('native-status')!.textContent = s; };
const unsupported = () => { throw new Error('This desktop service is not connected to e/Pi yet. No action was performed.'); };
window.piDesktop = {
  platform: 'darwin', locale: 'en',
  invoke: async (channel: string) => ({ok: false, error: {code: 'HOST_UNSUPPORTED', message: `Unsupported desktop service: ${channel}`}}),
  on: () => () => {}, getDroppedFilePath: () => null,
} as typeof window.piDesktop;
async function request(suffix: string, body?: unknown) {
  const res = await fetch(`${base}/${suffix}`, {method: body === undefined ? 'GET' : 'POST',
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
    if (draft && Object.values(draft as object).some(v => Array.isArray(v) && v.length)) throw new Error('Attachments are not supported by this native adapter yet.');
    await request('messages', {intentId: crypto.randomUUID(), content, deliverAs});
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
  configureActiveSession: async () => unsupported(),
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
    const modelId = current.configuration?.model?.id ?? current.ref.model ?? 'runtime';
    useAppStore.setState({
      messages, retainedTranscripts: {[nid!]: messages}, isRunning: running,
      sessions: [{id: nid, source: 'pi-native', title: current.title, messageCount: messages.length,
        projectPath: current.ref.cwd, modelId, providerId: current.ref.provider, mode: 'agent',
        thinkingLevel: current.configuration?.thinkingLevel ?? 'off', permissionMode: 'ask',
        capabilities: {canPrompt: available && capabilityAvailable(current, 'send.user-message'),
          canAbort: available && capabilityAvailable(current, 'abort'), canConfigure: false},
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

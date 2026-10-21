// Fixture boundary only: components and store below come from unmodified upstream.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { en, flattenCatalog } from '@pi-desktop/i18n';
import { ChatTranscript } from '@upstream/features/chat/transcript/ChatTranscript';
import { TranscriptDisclosureProvider } from '@upstream/features/chat/transcript/disclosure';
import { Composer } from '@upstream/components/Composer';
import { useAppStore } from '@upstream/stores/app-store';
import type { UiMessage } from '@pi-desktop/shared';

const card = new URLSearchParams(location.search).get('card') === 'B' ? 'B' : 'A';
const sessionId = `fixture-${card}`;
const createdAt = '2026-10-21T03:00:00.000Z';
const note = (text: string) => {
  document.getElementById('fixture-status')!.textContent = text;
};
window.piDesktop = {
  platform: 'darwin', locale: 'en',
  invoke: async (channel: string) => ({ok: false, error: {
    code: 'FIXTURE_UNSUPPORTED', message: `No desktop host in this preview: ${channel}`,
  }}),
  on: () => () => {},
  getDroppedFilePath: () => null,
} as typeof window.piDesktop;

const messages: UiMessage[] = [
  {id: `${card}-user`, role: 'user', content: `Inspect card ${card}'s isolated UI fixture.`, createdAt},
  {id: `${card}-thinking`, role: 'assistant', content: '', thinking: 'Fixture reasoning: inspect the example, then summarize. No model was invoked.', createdAt, status: 'complete'},
  {id: `${card}-tool`, role: 'tool', content: '', toolName: 'read', toolCallId: `${card}-read`,
    toolStatus: 'success', toolArgs: {path: 'fixture/example.ts'},
    toolResult: `// Fixture only, no file was read\nexport const card = '${card}';`, createdAt},
  {id: `${card}-answer`, role: 'assistant', content: `### Original PI Desktop components\n\nThis is **card ${card}**, rendered with upstream ChatTranscript and Composer.\n\n- Expand the tool process above.\n- Type below to test the original composer.\n- No model, filesystem or shell is connected.`, status: 'complete', createdAt},
];
useAppStore.setState({
  activeSessionId: sessionId, page: 'chat', messages,
  retainedSessionIds: [sessionId], retainedTranscripts: {[sessionId]: messages},
  sessions: [{id: sessionId, source: 'desktop', title: `Fixture ${card}`, messageCount: messages.length,
    providerId: 'fixture', modelId: 'fixture-model', mode: 'agent', thinkingLevel: 'off',
    permissionMode: 'ask', createdAt, updatedAt: createdAt}],
  providers: [{id: 'fixture', name: 'Fixture (no model)', vendorKey: 'fixture', protocol: 'openai',
    type: 'custom', enabled: true, supportsReasoning: false, supportedThinkingLevels: ['off'],
    authKind: 'none', hasSecret: false, models: [{id: 'fixture-model', thinkingLevels: ['off'],
      contextWindow: 8192, maxTokens: 1024, defaultThinkingLevel: 'off'}],
    createdAt, updatedAt: createdAt}],
  isRunning: false,
  showToast: (text: string) => note(text),
  sendPrompt: async (content, _draft, target, onAccepted) => {
    if (target && target !== sessionId) throw new Error('Cross-card fixture submission rejected');
    const state = useAppStore.getState();
    const next = [...state.messages, {id: crypto.randomUUID(), role: 'user' as const,
      content, createdAt: new Date().toISOString(), status: 'complete' as const}];
    useAppStore.setState({messages: next, retainedTranscripts: {[sessionId]: next}});
    onAccepted?.(sessionId);
    note(`Card ${card}: captured locally. No model request was sent.`);
    return true;
  },
  resolvePermission: async (_session, _request, decision) => {
    useAppStore.setState({pendingPermissions: {}});
    note(`Card ${card}: fixture decision = ${decision}. No command was executed.`);
  },
  configureActiveSession: async () => { throw new Error('Model configuration is not connected in this fixture'); },
});

function Fixture() {
  const state = useAppStore();
  return <div className="chat-surface" style={{height: '100%', minWidth: 0}}>
    <TranscriptDisclosureProvider>
      <ChatTranscript sessionId={sessionId} messages={state.messages} isRunning={false}
        pendingPermission={state.pendingPermissions[sessionId]?.[0]} />
    </TranscriptDisclosureProvider>
    <Composer />
  </div>;
}

document.getElementById('approval-fixture')!.addEventListener('click', () => {
  useAppStore.setState({pendingPermissions: {[sessionId]: [{
    sessionId, requestId: `${card}-permission`, toolCallId: `${card}-printf`, toolName: 'bash',
    argsPreview: {command: 'printf PI_UI_FIXTURE'}, risk: 'low',
    reason: 'Fixture only. No process exists; every decision stays in memory.',
  }]}});
});
document.documentElement.dataset.theme = 'light';
document.documentElement.dataset.platform = 'darwin';
const i18n = createInstance();
await i18n.init({lng: 'en', fallbackLng: 'en', resources: {en: {translation: flattenCatalog(en)}},
  interpolation: {escapeValue: false}});
createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18n}><Fixture /></I18nextProvider>);

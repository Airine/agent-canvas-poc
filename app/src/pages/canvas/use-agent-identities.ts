import { useCallback, useSyncExternalStore } from 'react';
import type { LiveStore } from './live-store';
import { sessionIdentities, type IdentitySource } from './session-identity';

/** Subscribe to identity changes in siblings, without rerendering on their token deltas. */
export function useAgentIdentities(store: LiveStore) {
  const subscribe = useCallback((notify: () => void) => {
    let cleanups: Array<() => void> = [];
    const bind = () => {
      cleanups.forEach(cleanup => cleanup());
      cleanups = [...store.nodes.keys()].flatMap(id => [store.sessions.subscribe(id, notify), store.subscribeNode(id, notify)]);
      notify();
    };
    bind();
    const off = store.subscribe(bind);
    return () => { off(); cleanups.forEach(cleanup => cleanup()); };
  }, [store]);
  const snapshot = useCallback(() => JSON.stringify([...store.nodes.values()].filter(peer => peer.backend === 'e').map(peer => {
    const session = store.sessions.get(peer.id);
    return { workspaceId: store.workspaceId ?? session?.workspaceId ?? '', nodeId: peer.id, title: session?.title ?? peer.title };
  })), [store]);
  const identities = useSyncExternalStore(subscribe, snapshot);
  const workspaceId = store.workspaceId ?? '';
  return sessionIdentities(JSON.parse(identities) as IdentitySource[], workspaceId);
}

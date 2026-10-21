import type { LiveStore, CanvasNode } from './live-store';

export function NativePiChat({store, node}: {store: LiveStore; node: CanvasNode}) {
  const query = new URLSearchParams({workspace: store.workspaceId ?? '', node: node.id});
  return <iframe title={`PI Desktop · ${node.title}`} className="nodrag nowheel"
    src={`/native/pi/ui.html?${query}`} style={{width: '100%', height: '100%', border: 0, background: '#fff'}}
    sandbox="allow-scripts allow-same-origin" />;
}

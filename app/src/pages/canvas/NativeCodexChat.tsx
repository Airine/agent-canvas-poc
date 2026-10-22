import { useEffect, useState } from 'react';
import type { CanvasNode, LiveStore } from './live-store';

export function NativeCodexChat({store, node}: {store: LiveStore; node: CanvasNode}) {
  const [url, setUrl] = useState<string>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const base = `/api/workspaces/${encodeURIComponent(store.workspaceId ?? '')}/nodes/${encodeURIComponent(node.id)}/codex`;
  useEffect(() => {
    let active = true;
    void fetch(base).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); if (active) setUrl(data.url); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [base, node.sessionState]);
  async function action(operation: string) {
    setBusy(true); setError('');
    try {
      const res = await fetch(`${base}/${operation}`, {method: 'POST'}), data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUrl(data.url);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <section className="nodrag nowheel" style={{height: '100%', display: 'flex', flexDirection: 'column', background: '#fff'}}>
    <div style={{fontSize: 12, padding: 6, color: '#333'}}>Codex · {node.codexProvider === 'singularity-x' ? 'Singularity-X API · ' : ''}permissions set in native composer
      <button disabled={busy || store.readOnly && !url} onClick={() => void action(url ? 'stop' : 'resume')} style={{marginLeft: 10}}>{url ? '停止' : '恢复 Codex'}</button>
      {error && <p role="alert">{error}</p>}
    </div>
    {url ? <iframe title={`Codex · ${node.id}`} src={url} sandbox="allow-scripts allow-same-origin"
      style={{width: '100%', flex: 1, border: 0, minHeight: 0}} /> : <p style={{padding: 16}}>本地记录已保留。恢复后从原版 Local chats 列表选择会话。</p>}
  </section>;
}

import { useId, useRef, useState } from 'react';
import { Check, Copy, Pencil, X } from 'lucide-react';
import type { SessionView } from '../../../api/e/contracts';
import { useLiveStore, type CanvasNode, type LiveStore } from './live-store';
import { useSession } from './session-store';
import { QueueReceipts } from './chat/QueueReceipts';
import { CollaborationStatus } from './chat/CollaborationStatus';
import { sessionIndicator } from './chat/presentation-state';
import { ChatPopover } from './chat/ChatPopover';
import { useAgentIdentities } from './use-agent-identities';
import { useSecondClock } from './utils';


export function SessionIdentity({ store, node }: { store: LiveStore; node: CanvasNode }) {
  const identity = useAgentIdentities(store).get(node.id) ?? { nickname: node.title, suffix: '', displayTitle: node.title, reference: '' };
  const [copiedReference, setCopied] = useState('');
  const copied = copiedReference === identity.reference && !!identity.reference;
  const session = useSession(store.sessions, node.id);
  useLiveStore(store);
  const [edit, setEdit] = useState<{ title: string; expectedVersion: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const composing = useRef(false);
  const errorId = useId();
  const workspaceId = store.workspaceId ?? session?.workspaceId;
  const editable = !!session && !!workspaceId && !store.readOnly && store.connState === 'online';
  const cancel = () => { if (!busy) { setEdit(null); setError(''); } };
  const save = async () => {
    if (!edit || busy || !editable) return;
    const title = edit.title.trim();
    if (!title) { setError('昵称不能为空'); return; }
    if (title === session.title) { cancel(); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId!)}/nodes/${encodeURIComponent(node.id)}/session`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, expectedVersion: edit.expectedVersion }),
      });
      const data = await response.json() as { session?: SessionView };
      if (!response.ok) {
        if (response.status === 409) {
          if (data.session) store.sessions.apply(data.session);
          // Keep the user's draft. A new version is only used after an explicit retry.
          setEdit(current => current ? { ...current, expectedVersion: store.sessions.get(node.id)?.version ?? current.expectedVersion } : current);
          setError('会话已更新，昵称尚未保存。请检查后重试，或取消后重新编辑。');
        } else setError(`昵称保存失败（${response.status}），请重试。`);
        return;
      }
      if (!data.session || data.session.nodeId !== node.id || data.session.workspaceId !== workspaceId) throw new Error('Invalid session response');
      store.sessions.apply(data.session);
      setEdit(null);
    } catch {
      setError('昵称未确认保存，请检查连接后重试。');
    } finally { setBusy(false); }
  };
  return <div className="session-identity nowheel" data-session-identity={node.id}
    onDoubleClick={event => { if ((event.target as Element).closest('button, input, form')) event.stopPropagation(); }}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onKeyDown={event => {
      if (edit && event.key === 'Escape' && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
        event.preventDefault(); event.stopPropagation(); cancel();
      }
    }}>
    {edit ? <form className="session-identity-form nodrag" onSubmit={event => { event.preventDefault(); void save(); }}>
      <input autoFocus aria-label="Agent 昵称" aria-describedby={error ? errorId : undefined} aria-invalid={!!error}
        maxLength={160} value={edit.title} disabled={busy}
        onChange={event => setEdit({ ...edit, title: event.target.value })}
        onKeyDown={event => { if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} />
      <button type="submit" aria-label="保存昵称" disabled={busy || !editable}><Check size={14} /></button>
      <button type="button" aria-label="取消修改昵称" onClick={cancel} disabled={busy}><X size={14} /></button>
    </form> : <span className="session-identity-name" title={identity.displayTitle}>
      <span className="session-nickname">{identity.nickname}</span>
      {identity.suffix && <span className="session-discriminator">{identity.suffix}</span>}
      <button type="button" className="nodrag" aria-label={`修改 Agent 昵称：${identity.displayTitle}`}
        title="修改昵称" disabled={!editable}
        onClick={() => { if (session) { setEdit({ title: session.title, expectedVersion: session.version }); setError(''); } }}>
        <Pencil size={12} aria-hidden="true" />
      </button>
      <button type="button" className="nodrag" aria-label="复制 Agent 引用" title={copied ? '已复制名字与 hash' : '复制名字与 hash'} disabled={!identity.reference}
        onClick={() => { void navigator.clipboard.writeText(identity.reference).then(() => { setCopied(identity.reference); setError(''); }, () => { setError('复制失败，请允许剪贴板访问后重试。'); }); }} onBlur={() => setCopied('')}>
        {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      </button><span role="status" className="sr-only">{copied ? '已复制 Agent 名字与 hash' : ''}</span>
    </span>}
    {error && <span id={errorId} role="alert" className="session-identity-error">{error}</span>}
  </div>;
}

/** One primary sphere: healthy live context, otherwise the actual session state. */
export function SessionStatus({ store, node }: { store: LiveStore; node: CanvasNode }) {
 const view=useSession(store.sessions,node.id);useLiveStore(store);const now=useSecondClock(view?.lifecycle==='ready');
 const indicator=sessionIndicator(view,store.connState==='online',now,store.readOnly),{state,usage}=indicator;
 const important=indicator.tone==='danger'||!!indicator.queueLabel||!!state.warning||state.recovery||state.pending.length>0||store.connState!=='online'||store.readOnly||view?.lifecycle==='stopped';
 const percent=usage?`${Number(usage.percent!.toFixed(1))}%`:undefined;
 const explanation=[indicator.explanation,usage?`上下文 ${percent} · ${usage.tokens} / ${usage.contextWindow} tokens · 采集于 ${indicator.confirmedAt}`:'当前不展示上下文用量'].join(' · ');
 const tooltipId=useId();
 return <span className="session-status" data-tone={indicator.tone} data-indicator={usage?'context':'state'}>
  <ChatPopover id="session-status" label="会话状态与上下文" title={null} side="bottom" align="end" className="session-status-trigger" contentClassName="chat-status-popover" triggerProps={{'data-session-status':node.id,'aria-label':explanation,'aria-describedby':tooltipId}} trigger={<>
   {usage?<svg className="session-context-ring" viewBox="0 0 24 24" aria-hidden="true"><circle className="session-context-track" cx="12" cy="12" r="9"/><circle className="session-context-fill" cx="12" cy="12" r="9" pathLength="100" strokeDasharray={`${Math.min(100,usage.percent!)} 100`} transform="rotate(-90 12 12)"/></svg>:<span className="session-status-light" aria-hidden="true"/>}
   {usage?<span className="session-context-value">{percent}</span>:important?<span className="session-status-important">{indicator.label}</span>:<span className="sr-only">{indicator.label}</span>}
   {indicator.queueLabel&&<span className="session-queue-status">{indicator.queueLabel}</span>}
  </>}>
   <p className="chat-status-label">{indicator.label}</p>{state.reason&&<p className="chat-muted">{state.reason}</p>}{state.warning&&<p className="chat-warning">{state.warning}</p>}
   {indicator.queueLabel&&<p className="chat-warning">{indicator.queueLabel}。会话恢复与队列处理是两步；未知消息需在输入框上方展开待发列表核实，处理后仍须单独恢复待发。</p>}
   {usage?<><p className="chat-context-value">{percent}</p><p className="chat-muted">{usage.tokens?.toLocaleString()} / {usage.contextWindow.toLocaleString()} tokens</p><p className="chat-muted">Pi contextUsage · 采集于 <time dateTime={indicator.confirmedAt}>{indicator.confirmedAt}</time></p></>:<p className="chat-muted">{indicator.tone==='danger'?'异常状态优先显示；请查看会话诊断或执行配置核实。':state.pending.length?'请先处理待审批请求。':view?.lifecycle==='ready'?'尚无有效上下文数据，不使用累计 token 估算。':'会话就绪并取得真实用量后显示上下文。'}</p>}
   <QueueReceipts view={view}/>
   <CollaborationStatus view={view} online={store.connState==='online'}/>
  </ChatPopover>
  <span id={tooltipId} role="tooltip" className="session-status-tooltip chat-control-tooltip is-below">{indicator.label}{indicator.queueLabel?` · ${indicator.queueLabel}`:''}{usage?` · 上下文 ${percent}`:''} · 点击查看详情</span>
 </span>;
}

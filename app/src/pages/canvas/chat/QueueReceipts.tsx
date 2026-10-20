import type { SessionView } from '../../../../api/e/contracts';

/** Historical queue receipts live in status details, not between transcript and composer. */
export function QueueReceipts({view}:{view?:SessionView}) {
 const items=view?.queue?.items.filter(item=>item.state==='consumed')??[];
 if(!items.length)return null;
 const shown=items.sort((a,b)=>(Date.parse(a.consumedAt??'')||0)-(Date.parse(b.consumedAt??'')||0)).slice(-5);
 return <details className="chat-queue-receipts">
  <summary>队列回执 · 已确认消费 {items.length}</summary>
  <p className="chat-muted">仅显示最近确认结果；待发与未知结果仍在输入框上方处理。</p>
  {shown.map(item=><article key={item.id} data-queue-receipt={item.id}>
   <p>{item.content.slice(0,120)||'仅附件消息'}</p>
   <footer>{item.origin?.kind==='agent'?`来自 ${item.origin.label} · `:''}<time dateTime={item.consumedAt}>{item.consumedAt??'运行器已确认'}</time></footer>
  </article>)}
  {items.length>shown.length&&<p className="chat-muted">另有 {items.length-shown.length} 条历史回执；完整队列状态见会话诊断。</p>}
 </details>;
}

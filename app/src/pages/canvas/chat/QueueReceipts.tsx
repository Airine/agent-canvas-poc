import type { SessionView } from '../../../../api/e/contracts';
import { redact } from './error-presentation';

/** Historical queue receipts live in status details, not between transcript and composer. */
export function QueueReceipts({view}:{view?:SessionView}) {
 const items=view?.queue?.items.filter(item=>item.state==='consumed')??[];
 const reviewed=view?.queue?.items.filter(item=>item.review)??[];
 if(!items.length&&!reviewed.length)return null;
 const shown=items.sort((a,b)=>(Date.parse(a.consumedAt??'')||0)-(Date.parse(b.consumedAt??'')||0)).slice(-5);
 return <>{!!items.length&&<details className="chat-queue-receipts">
  <summary>队列回执 · 已确认消费 {items.length}</summary>
  <p className="chat-muted">仅显示最近确认结果；待发与未知结果请展开待发列表处理。</p>
  {shown.map(item=><article key={item.id} data-queue-receipt={item.id}>
   <p>{item.content.slice(0,120)||'仅附件消息'}</p>
   <footer>{item.origin?.kind==='agent'?`来自 ${item.origin.label} · `:''}<time dateTime={item.consumedAt}>{item.consumedAt??'运行器已确认'}</time></footer>
  </article>)}
  {items.length>shown.length&&<p className="chat-muted">另有 {items.length-shown.length} 条历史回执；完整队列状态见会话诊断。</p>}
 </details>}
 {!!reviewed.length&&<details className="chat-queue-receipts">
  <summary>人工处理记录 · {reviewed.length}</summary>
  <p className="chat-muted">仅结束 Canvas 队列跟踪，不代表发送成功、撤回或取消运行器执行。原始证据保留。</p>
  {reviewed.map(item=><article key={item.id} data-queue-review={item.id}>
   <p>{item.content.slice(0,120)||'仅附件消息'}</p>
   <p>用户核实后结束跟踪 · 原结果：未知</p>
   <p>核实记录：{redact(item.review!.note)}</p>
   {item.error&&<p>原始错误：{redact(item.error)}</p>}
   <footer><time dateTime={item.review!.at}>{item.review!.at}</time> · 操作 {item.review!.mutationId}</footer>
  </article>)}
 </details>}</>;
}

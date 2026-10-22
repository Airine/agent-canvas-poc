import { ChevronDown, ListOrdered } from 'lucide-react';
import { ChatConfirm } from './ChatPopover';
import { useState } from 'react';
import type { Attachment,QueueMutation,SessionView } from '../../../../api/e/contracts';
import type { LiveStore } from '../live-store';
import { AttachmentTray } from './AttachmentTray';
import { redact } from './error-presentation';
export function QueuePanel({view,store,nodeId}:{view?:SessionView;store:LiveStore;nodeId:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<{id:string;content:string;attachments:Attachment[]}|null>(null);
 const [expanded,setExpanded]=useState(false),[steer,setSteer]=useState<string|null>(null);
 const [review,setReview]=useState<{itemId:string;revision:number;mutationId:string;note:string;confirmed:boolean}|null>(null);
 const queue=view?.queue;if(!queue||!queue.items.length)return null;
 const pending=queue.items.filter(i=>i.state==='pending'),unsettled=queue.items.filter(i=>['dispatching','submitted','unknown','rejected'].includes(i.state));
 const disabled=busy||store.readOnly||store.connState!=='online';
 async function act(input:Partial<QueueMutation>){
  setBusy(true);setError('');try{await store.sessionAction(nodeId,'queue',{mutationId:crypto.randomUUID(),expectedRevision:queue!.revision,operation:'pause',...input});if(input.operation==='edit')setEditing(null);}catch(e){setError(redact(String(e)));}finally{setBusy(false);}
 }
 async function sendNow(id:string){const active=view?.snapshot?.runs.some(r=>r.state==='running');if(active){setSteer(id);return;}await act({operation:'sendNow',itemId:id,confirmSteer:false});}
 async function reviewUnknown(){
  if(!review||!review.confirmed||!review.note.trim()||disabled)return;
  setBusy(true);setError('');
  try{
   await store.sessionAction(nodeId,'queue',{mutationId:review.mutationId,expectedRevision:review.revision,operation:'reviewUnknown',itemId:review.itemId,confirmReview:true,reviewNote:review.note});
   setReview(null);
  }catch(e){setError(redact(String(e)));}finally{setBusy(false);}
 }
 if(!pending.length&&!unsettled.length)return null;
 return <section className="chat-queue" aria-label="Canvas 待发队列"><header><button type="button" className="chat-queue-toggle" aria-label="展开待发列表" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><ListOrdered size={16}/><strong>待发 {pending.length}</strong><ChevronDown size={13}/></button><span>{queue.paused?'已暂停':'已授权按序继续'}</span><button type="button" disabled={disabled||queue.paused&&unsettled.some(i=>i.state==='unknown')} onClick={()=>void act({operation:queue.paused?'resume':'pause',authorize:queue.paused})}>{queue.paused?'恢复待发':'暂停待发'}</button></header>
  {unsettled.some(i=>i.state==='unknown')&&<p className="chat-muted">未知消息需先人工核实；恢复会话不会自动解除队列阻塞。{!expanded&&<button type="button" onClick={()=>setExpanded(true)}>核实未知消息</button>}</p>}
  {!expanded&&<div className="chat-queue-compact"><p className="chat-queue-preview">{unsettled.some(i=>i.state==='unknown')?'结果未知 · 冻结，不会自动重发':unsettled.length?'已交给运行器 · 等待确认':pending[0]?.content||'暂无待发消息'}{pending.length>1?` · 另有 ${pending.length-1} 条`:''}</p>{pending[0]&&!unsettled.length&&<nav aria-label="首条待发操作"><button type="button" aria-label="编辑首条待发" disabled={disabled||pending[0].origin?.kind==='agent'} onClick={()=>{const item=pending[0];setEditing({id:item.id,content:item.content,attachments:item.attachments});setExpanded(true);}}>编辑</button><button type="button" aria-label="立即发送首条待发" disabled={disabled||view?.lifecycle!=='ready'} onClick={()=>void sendNow(pending[0].id)}>立即发送</button></nav>}</div>}
  {expanded&&<><p className="chat-muted">采用发送时当前会话的模型配置。已交给运行器的消息不可编辑或撤回。</p>
  {queue.paused&&queue.reason&&<p className="chat-muted">{queue.reason}</p>}
  <div className="chat-queue-items">{[...unsettled,...pending].map(item=><article key={item.id} data-queue-id={item.id}>
   <div className="chat-queue-summary"><span>{item.state==='pending'?'尚未提交':item.state==='unknown'?'结果未知 · 冻结':item.state==='rejected'?'运行器拒绝':'已交给运行器 · 等待消费确认'}</span><span>{item.attachments.length?`${item.attachments.length} 个附件`:''}</span></div>
   {item.origin?.kind==='agent'&&<p className="chat-muted">来自 {item.origin.label} · Canvas 已关联身份；不可改写，可删除。</p>}
   {editing?.id===item.id?<><textarea aria-label="编辑待发消息" value={editing.content} onChange={e=>setEditing({...editing,content:e.target.value})}/><AttachmentTray items={editing.attachments} onChange={attachments=>setEditing({...editing,attachments})}/><button type="button" disabled={disabled} onClick={()=>void act({operation:'edit',itemId:item.id,content:editing.content,attachments:editing.attachments})}>保存待发</button><button type="button" onClick={()=>setEditing(null)}>取消编辑</button></>:<><p className="chat-queue-text">{item.content||'仅附件消息'}</p>{!!item.attachments.length&&<details><summary>查看待发附件</summary><AttachmentTray items={item.attachments}/></details>}</>}
   {item.error&&<p role="alert" className="chat-error">{redact(item.error)} · 不会自动重发。</p>}
   {item.state==='unknown'&&(view?.queueReviewVersion===1?<button type="button" disabled={disabled||view.lifecycle==='ready'&&!!view.snapshot?.runs.some(r=>r.state==='running')} onClick={()=>{setError('');setReview({itemId:item.id,revision:queue.revision,mutationId:crypto.randomUUID(),note:'',confirmed:false});}}>人工核实并结束跟踪</button>:<p className="chat-muted">当前 API 尚未支持人工核实；安全更新后端后可处理，不要重复恢复会话。</p>)}
   {item.state==='pending'&&<nav aria-label="待发消息操作"><button type="button" disabled={disabled||item.origin?.kind==='agent'} onClick={()=>setEditing({id:item.id,content:item.content,attachments:item.attachments})}>编辑</button><button type="button" disabled={disabled} onClick={()=>void act({operation:'delete',itemId:item.id})}>删除</button><button type="button" disabled={disabled||pending[0].id===item.id} onClick={()=>void act({operation:'move',itemId:item.id,direction:'up'})}>上移</button><button type="button" disabled={disabled||pending.at(-1)?.id===item.id} onClick={()=>void act({operation:'move',itemId:item.id,direction:'down'})}>下移</button><button type="button" disabled={disabled||view?.lifecycle!=='ready'} onClick={()=>void sendNow(item.id)}>立即发送</button></nav>}
  </article>)}</div>
  {queue.items.some(i=>i.state==='consumed')&&<p className="chat-muted">已确认消费 {queue.items.filter(i=>i.state==='consumed').length} 条；历史回执在“会话状态与上下文”中查看。</p>}
  </>}{!expanded&&queue.paused&&queue.reason&&<p className="chat-muted chat-queue-reason">{queue.reason}</p>}
  <ChatConfirm open={!!steer} title="以 Steer 立即发送？" confirmLabel="确认 Steer 发送" busy={busy} onCancel={()=>setSteer(null)} onConfirm={()=>{if(steer)void act({operation:'sendNow',itemId:steer,confirmSteer:true}).finally(()=>setSteer(null));}} description="当前轮正在执行。此消息将明确引导当前轮，不会自动中断。提交后不能编辑或撤回。"/>
  <ChatConfirm open={!!review} title="核实未知消息" confirmLabel="保存核实记录并结束跟踪" busy={busy} confirmDisabled={disabled||!review?.confirmed||!review.note.trim()||review.revision!==queue.revision} onCancel={()=>setReview(null)} onConfirm={()=>void reviewUnknown()} description={<div className="chat-queue-review-form">
   <p>请先核对会话历史、工具结果和会话诊断。此操作仅结束这条消息的 Canvas 队列跟踪，不会证明发送成功，也不会撤回运行器可能已经执行的操作。</p>
   <p>原消息、未知结果和核实记录会保留；不会重发，其他待发仍暂停，需要另行恢复。</p>
   <label>核实记录<textarea aria-label="核实记录" maxLength={1000} disabled={busy} value={review?.note??''} onChange={e=>{if(review)setReview({...review,note:e.target.value,mutationId:crypto.randomUUID()});}} placeholder="写下核对的证据与不再跟踪此条消息的原因"/></label>
   <label><input type="checkbox" disabled={busy} checked={review?.confirmed??false} onChange={e=>{if(review)setReview({...review,confirmed:e.target.checked});}}/>我已核实并理解：结果仍未确认，不会自动重发或恢复待发</label>
   {review&&review.revision!==queue.revision&&<p role="alert" className="chat-error">队列版本已改变，请取消后重新核实。</p>}
   {error&&<p role="alert" className="chat-error">{error}。未确认处理成功；请核对最新状态。</p>}
  </div>}/>
  {error&&<p role="alert" className="chat-error">{error} · 操作未确认，请核对队列当前版本。</p>}
 </section>;
}

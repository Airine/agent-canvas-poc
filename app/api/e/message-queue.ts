import type { MessageQueue, QueueMutation, SessionSnapshot } from './contracts.js';
import { validateMessage } from './attachments.js';
import { isReviewedQueueAction } from '../../shared/queue-review.mjs';
export function emptyQueue(): MessageQueue { return {revision:0,paused:true,reason:'待发尚未授权继续',items:[]}; }
export function pauseQueue(queue: MessageQueue, reason: string, restart = false): void {
  queue.paused = true; queue.reason = reason;
  if (restart) for (const item of queue.items) if (['dispatching','submitted'].includes(item.state)) { item.state='unknown';item.error='重启前的派发结果未确认，不会重发'; }
  queue.revision++;
}
export function mutateQueue(current: MessageQueue, input: QueueMutation): void {
  // Stage mutations so validation failures leave revision, items and authorization intact.
  const queue = { ...current, items: current.items.map(item => ['edit','reviewUnknown'].includes(input.operation) && item.id === input.itemId ? { ...item } : item) };
  if (input.expectedRevision !== queue.revision) throw new Error('队列版本冲突，请刷新后重试');
  const item = queue.items.find(i=>i.id===input.itemId);
  if (['edit','delete','move','sendNow'].includes(input.operation) && (!item || item.state !== 'pending')) throw new Error('只能操作尚未交给运行器的待发消息');
  if (input.operation === 'add') {
    if (!input.itemId || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.itemId) || item) throw new Error('待发标识重复或无效');
    if (queue.items.filter(i=>i.state==='pending').length >= 20) throw new Error('待发队列达到容量限制（20 条 / 32 MiB）');
    const message=validateMessage(input.content??'',input.attachments??[]);
    queue.items.push({id:input.itemId,intentId:`queue:${input.itemId}`,state:'pending',createdAt:new Date().toISOString(),...message});
    if (input.authorize === true && !queue.items.some(i=>i.state==='unknown')) { queue.paused=false;delete queue.reason; }
  } else if (input.operation === 'reviewUnknown') {
    if (!item || item.state !== 'unknown' || item.review) throw new Error('只能核实尚未处理的未知消息');
    const note = input.reviewNote?.trim();
    if (input.confirmReview !== true || !note || note.length > 1000 || !input.mutationId) throw new Error('请明确确认并填写核实记录（1–1000 字）');
    item.state = 'dismissed';
    item.review = { mutationId: input.mutationId, actor: 'user', decision: 'stop-tracking', priorState: 'unknown', at: new Date().toISOString(), note };
    // Keep content, origin, action identity and original error. This is not a delivery receipt.
    queue.paused = true; queue.reason = '人工核实记录已保存；待发仍暂停，需单独恢复';
  } else if (input.operation === 'edit') Object.assign(item!,validateMessage(input.content??'',input.attachments??[]));
  else if (input.operation === 'delete') queue.items.splice(queue.items.indexOf(item!),1);
  else if (input.operation === 'move') {
    const a=queue.items.indexOf(item!), pending=queue.items.filter(i=>i.state==='pending'), index=pending.indexOf(item!)+(input.direction==='up'?-1:1), other=pending[index];
    if (other) { const b=queue.items.indexOf(other);[queue.items[a],queue.items[b]]=[queue.items[b],queue.items[a]]; }
  } else if (input.operation === 'pause') { queue.paused=true;queue.reason='用户暂停待发'; }
  else if (input.operation === 'resume') {
    if (input.authorize !== true) throw new Error('恢复待发需要明确授权');
    if (queue.items.some(i=>i.state==='unknown')) throw new Error('有结果未知的消息，核实前队列冻结');
    queue.paused=false;delete queue.reason;
  }
  queue.revision++;
  if (['add','edit'].includes(input.operation) && Buffer.byteLength(JSON.stringify(queue),'utf8') > 32*1024*1024) throw new Error('待发队列达到容量限制（20 条 / 32 MiB）');
  if (queue.reason === undefined) delete current.reason;
  Object.assign(current, queue);
}
/** e applied means an exact public user-message tuple was observed, not an HTTP ack. */
export function reconcileQueue(queue: MessageQueue, snapshot: SessionSnapshot): boolean {
  let changed=false;
  for (const item of queue.items) {
    if (!['dispatching','submitted','unknown'].includes(item.state)) continue;
    const action=snapshot.pendingActions.find(a=>a.idempotencyKey===item.intentId || item.actionId && a.id===item.actionId);
    if (!action) continue;
    if (action.state==='applied') { item.state='consumed';item.consumedAt=typeof action.settledAt==='string'?action.settledAt:new Date().toISOString();delete item.error;changed=true; }
    else if (action.state==='rejected') {item.state='rejected';item.error=action.reason??'运行器拒绝';queue.paused=true;queue.reason=item.error;changed=true;}
    else if (action.state==='outcome-unknown' && item.state!=='unknown') { item.state='unknown';item.error=action.reason??'派发结果未知';queue.paused=true;queue.reason=item.error;changed=true; }
    else if (item.state==='dispatching' && ['submitted','dispatched'].includes(action.state)) { item.state='submitted';item.actionId=action.id;changed=true; }
  }
  if (changed) queue.revision++;
  return changed;
}
export function queueReady(queue: MessageQueue, snapshot?: SessionSnapshot): boolean {
  return !queue.paused && !!snapshot && snapshot.capabilities.some(c=>c.name==='send.user-message'&&c.available&&c.authority==='authoritative'&&(!c.expiresAt||Date.parse(c.expiresAt)>Date.now())) && snapshot.status==='idle' && !snapshot.runs.some(r=>r.state==='running') && !snapshot.approvals?.some(a=>a.state==='pending') && !snapshot.pendingActions.some(a=>a.kind==='send'&&['submitted','dispatched','outcome-unknown'].includes(a.state)&&!isReviewedQueueAction(queue,a)) && !queue.items.some(i=>['dispatching','submitted','unknown'].includes(i.state));
}

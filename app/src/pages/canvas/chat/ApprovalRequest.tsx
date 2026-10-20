import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SessionApproval, SessionTool } from '../../../../api/e/contracts';
import type { LiveStore } from '../live-store';
import { useLiveStore } from '../live-store';
import { useSession, capabilityAvailable } from '../session-store';
import { getChatUI } from './chat-ui-store';
import { redact } from './error-presentation';
import { Output, Disclosure } from './primitives';
import { approvalLabel } from './presentation-state';
export function ApprovalRequest({approval,tool,store,nodeId}:{approval:SessionApproval;tool?:SessionTool;store:LiveStore;nodeId:string}) {
 useLiveStore(store);const view=useSession(store.sessions,nodeId);const ui=getChatUI(store.workspaceId??'',nodeId,view?.ref.nativeSessionId??'');const local=useSyncExternalStore(ui.subscribe,ui.getSnapshot);
 const [now,setNow]=useState(Date.now);useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 const canonicalPending=view?.snapshot?.pendingActions.some(a=>a.kind==='approval'&&a.targetApprovalId===approval.id&&['submitted','dispatched'].includes(a.state));
 const busy=local.expanded[`approval-pending:${approval.id}`]||canonicalPending;
 const allowed=store.connState==='online'&&!store.readOnly&&capabilityAvailable(view,'approval.resolve',now)&&approval.state==='pending'&&!busy;
 async function decide(decision:'approved'|'rejected'){
  const intentKey=`approval-intent:${approval.id}:${decision}`;
  // Stable across remounts; key is scoped to native session and user decision.
  const intentId=ui.intent(intentKey);
  ui.toggle(`approval-pending:${approval.id}`,true);
  try{await store.sessionAction(nodeId,'approval',{intentId,approvalId:approval.id,decision});}
  catch(e){ui.update({error:redact(e instanceof Error?e.message:String(e))});}
  finally{ui.toggle(`approval-pending:${approval.id}`,false);}
 }
 if(approval.state!=='pending')return <span className="chat-resolved">{approvalLabel[approval.state]??approval.state} · {approval.toolName??approval.kind}</span>;
 const review=[...(view?.approvalAudit??[])].reverse().find(a=>a.approvalId===approval.id);
 const raw=tool?.arguments;
 const command=raw&&typeof raw==='object'&&'command' in raw?String(raw.command):raw!==undefined?JSON.stringify(raw,null,2):approval.summary??'未提供请求参数';
 return <section className="chat-approval" data-testid="approval-card" data-approval-id={approval.id} tabIndex={-1}>
  <header><span className="chat-dot warning"/><strong>需要你的批准</strong><span className="chat-muted">{approval.toolName??approval.kind}</span></header>
  <Output text={redact(command)}/>{raw===undefined&&<p className="chat-muted">仅收到上游摘要，可能已截断；请确认完整操作后再批准。</p>}
  <p className="chat-muted">这会在 Agent 工作目录执行操作。请核对命令和目标文件。</p>
  {review&&<p className="chat-muted" data-testid="approval-review-status">{review.state==='reviewing'?'AI 审查中；你仍可手动决定':review.state==='manual'||review.state==='failed'?'需要你确认':review.state==='cancelled'?'自动审查已失效':'自动审批已提交，等待 e 确认'} · {redact(review.reason)}</p>}
  <div className="chat-actions"><button className="chat-primary" disabled={!allowed} onClick={()=>void decide('approved')}>{busy?'等待确认…':'批准'}</button><button className="chat-secondary" disabled={!allowed} onClick={()=>void decide('rejected')}>拒绝</button></div>
  {!allowed&&!busy&&<p className="chat-muted">当前不可提交审批：连接、能力或工作区权限尚未就绪。</p>}
  <Disclosure ui={ui} id={`approval-info:${approval.id}`} label="技术详情"><Output text={redact(approval)}/></Disclosure>
 </section>;
}

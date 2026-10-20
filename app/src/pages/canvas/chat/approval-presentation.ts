import type { ApprovalAudit, SessionView } from '../../../../api/e/contracts';
export function approvalAuditLabel(a:ApprovalAudit):string {
 if(a.state==='cancelled')return '自动审查已失效';
 if(a.state==='reviewing')return 'AI 审查中；你仍可手动决定';
 if(a.state==='submitting')return '正在提交审批，等待 e 确认';
 if(a.state==='submitted')return '审批已提交，执行状态待 e 确认';
 if(a.source==='manual')return '规则转人工 · 未调用 AI';
 if(a.source==='ai'){
  if(a.reviewAttempted===false)return '未启动 AI 审查 · 需人工确认';
  if(a.reviewAttempted===undefined)return '自动审批转人工 · 旧版记录';
  return a.state==='failed'?'AI 审查或提交失败 · 需人工确认':'AI 审查后转人工';
 }
 return '自动审批未确认 · 需人工处理';
}
export function approvalProgress(view:SessionView|undefined,id:string){
 const audit=[...(view?.approvalAudit??[])].reverse().find(a=>a.approvalId===id);
 const reviewing=view?.lifecycle==='ready'&&view.approvalMode==='assisted'&&audit?.state==='reviewing';
 const submitting=view?.lifecycle==='ready'&&['submitting','submitted'].includes(audit?.state??'');
 return {audit,reviewing,title:reviewing?'AI 正在审查':submitting?'等待审批确认':'需要你的批准'};
}
export function allPendingReviewing(view:SessionView|undefined){
 const pending=view?.snapshot?.approvals?.filter(a=>a.state==='pending')??[];
 return pending.length>0&&pending.every(a=>approvalProgress(view,a.id).reviewing);
}

import type { DeliverAs, SessionView, SessionRef } from '../../../../api/e/contracts';
import { allPendingReviewing } from './approval-presentation';
import { capabilityAvailable } from '../session-store';
export const approvalLabel:Record<string,string>={approved:'已批准',rejected:'已拒绝',cancelled:'已取消',pending:'等待批准','outcome-unknown':'结果未证实'};
/** No cause is inferred from interrupted alone: it is also used when loading history. */
export function needsSessionRecovery(view:SessionView|undefined):boolean {
 return view?.lifecycle==='interrupted'&&!view.error&&view.snapshot?.status!=='degraded'&&!view.snapshot?.degradedReasons?.length;
}
/** Historical ref/config are useful context, but never presented as a current readback. */
export function sessionModelPresentation(view:SessionView|undefined,online=true,fallback?:SessionRef) {
 const config=view?.configuration,ref=view?.ref??fallback;
 const model=config?.model?.id??ref?.model,provider=config?.model?.provider??ref?.provider;
 const current=!!config?.model&&view?.lifecycle==='ready'&&online&&!view.configurationError&&!view.configurationPending&&!view.error&&view.snapshot?.status!=='degraded'&&!view.snapshot?.degradedReasons?.length;
 const historical=!!model&&!current;
 const prefix=historical?'上次使用：':'';
 return {model,provider,current,historical,thinking:config?.thinkingLevel,
  label:model?`${prefix}${[provider,model].filter(Boolean).join('/')}`:'模型尚未确认',
  summary:model??(view?.lifecycle==='starting'?'正在连接':'待确认模型')};
}
export function presentation(view: SessionView|undefined, online: boolean, mode: DeliverAs='nextTurn', now=Date.now(), readOnly=false) {
 const s=view?.snapshot, pending=s?.approvals?.filter(a=>a.state==='pending')??[];
 const active=view?.lifecycle==='ready'&&!!s?.runs.some(r=>r.state==='running');
 const capability=mode==='steer'?'send.steer':mode==='followUp'?'send.follow-up':'send.user-message';
 const recovery=needsSessionRecovery(view);
 const fault=view?.lifecycle==='failed'||!!view?.error||s?.status==='degraded'||!!s?.degradedReasons?.length||view?.lifecycle==='interrupted'&&!recovery;
 let label='正在启动', reason='等待会话就绪，可先写草稿';
 if(readOnly){label='只读工作区';reason='工作区已归档，恢复工作区后才能发送';}
 else if(!online){label='连接中断';reason='正在重连，草稿会保留；不会自动发送';}
 else if(view?.lifecycle==='starting'){label='正在启动';reason='正在连接运行器，可先写草稿';}
 else if(recovery){label='待恢复';reason='会话尚未恢复，历史和草稿已保留；不会自动执行待发消息';}
 else if(view?.lifecycle==='stopped'){label='会话已停止';reason='恢复会话后可发送，草稿会保留';}
 else if(fault){label=view?.lifecycle==='failed'?'会话故障':'运行器异常';reason='运行器报告异常，请查看诊断；历史和草稿保留';}
 else if(s?.status==='exited'){label='会话已停止';reason='恢复会话后可发送，草稿会保留';}
 else if(view?.lifecycle==='ready'){
  label=pending.length?`${allPendingReviewing(view)?'AI 审查中':'等待批准'} · ${pending.length}`:active?(s?.tools.some(t=>t.state==='running')?'正在执行工具':'正在生成'):'可继续对话';
  reason=!capabilityAvailable(view,capability,now)?'当前发送能力不可用或已过期，草稿会保留':mode==='nextTurn'&&active?'当前轮执行中，可先写草稿，或选择 Steer/Follow-up':'';
 }
 const unknown=s?.pendingActions?.filter(a=>a.state==='outcome-unknown'&&a.kind!=='model').length??0;
 const latest=[...(s?.messages??[])].filter(m=>m.role==='assistant').sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'')||b.order-a.order)[0];
 if(online&&!readOnly&&view?.lifecycle==='ready'&&!fault&&!active&&!pending.length){if(latest?.state==='cancelled'||latest?.stopReason==='aborted')label='已中断 · 可继续对话';else if(latest?.error||latest?.stopReason==='error')label='上次回复失败 · 可继续对话';}
 const errors=active?s?.messages.filter(m=>(m.error||m.stopReason==='error')&&s.runs.some(r=>r.id===m.runId&&r.state==='running')).length??0:0;
 const danger=label==='会话故障'||label==='运行器异常'||label.startsWith('上次回复失败');
 const tone=danger?'danger':unknown?'warning':online&&view?.lifecycle==='ready'&&pending.length?'approval':active?'active':online&&view?.lifecycle==='ready'&&!readOnly?'ready':'muted';
 return {label,reason,tone,recovery,canEdit:!readOnly,canSend:!readOnly&&online&&!fault&&s?.status!=='exited'&&s?.status!=='degraded'&&!s?.degradedReasons?.length&&capabilityAvailable(view,capability,now)&&!(mode==='nextTurn'&&active),pending,active,warning:unknown?`${unknown} 个操作结果未确认，不会自动重发；请查看会话诊断`:errors?'本轮曾出现请求错误；当前仍在执行':undefined};
}

/** Presentation only: do not collapse unrelated lifecycle, approval or unknown-action facts. */
export function sessionNotices(view:SessionView|undefined,online:boolean,readOnly=false,now=Date.now()) {
 const notices:Array<{id:string;title:string;description:string;tone:'neutral'|'warning'|'danger';recover?:boolean;approval?:boolean}>=[];
 if(readOnly)notices.push({id:'archive',title:'工作区只读',description:'恢复工作区后才能继续，历史和草稿保留。',tone:'neutral'});
 else if(!online)notices.push({id:'offline',title:'连接中断',description:'正在重连，草稿会保留；不会自动发送。',tone:'neutral'});
 else if(needsSessionRecovery(view))notices.push({id:'recovery',title:'会话尚未恢复',description:'历史已保留，恢复后继续原对话。',tone:'neutral',recover:true});
 else if(view?.lifecycle==='stopped')notices.push({id:'stopped',title:'会话已停止',description:'历史已保留，可恢复原会话。',tone:'neutral',recover:true});
 else if(view?.lifecycle==='failed'||view?.lifecycle==='interrupted'||view?.snapshot?.status==='degraded'||view?.snapshot?.degradedReasons?.length)notices.push({id:'runtime',title:'运行器暂不可用',description:'可尝试恢复原会话；不会重发历史消息或未确认操作。',tone:'danger',recover:true});
 else if(!view||view.lifecycle==='starting')notices.push({id:'starting',title:'正在连接运行器',description:'可以先写草稿，就绪后再发送。',tone:'neutral'});
 else if(view.error)notices.push({id:'runtime-error',title:'会话运行器报告异常',description:'请查看会话诊断，消息历史与草稿仍保留。',tone:'danger'});
 const pending=view?.snapshot?.approvals?.filter(a=>a.state==='pending').length??0;
 if(pending)notices.push({id:'approval',title:`${allPendingReviewing(view)?'AI 审查中':'等待批准'} · ${pending} 项`,description:allPendingReviewing(view)?'独立 AI 正在审查；无需重复点批准，也可随时人工接管。':'查看具体工具请求后再决定，不会自动放宽权限。',tone:'warning',approval:true});
 const covered=new Set(view?.queue?.items.filter(i=>i.state==='unknown'||i.state==='rejected').map(i=>i.intentId));
 const unresolved=view?.snapshot?.pendingActions?.filter(a=>a.kind!=='model'&&!covered.has(a.idempotencyKey??'')&&(a.state==='outcome-unknown'||a.state==='rejected'||(['submitted','dispatched'].includes(a.state)&&!!a.deadlineAt&&Date.parse(a.deadlineAt)<now))).length??0;
 if(unresolved)notices.push({id:'actions',title:`${unresolved} 项操作未确认或被拒绝`,description:'请在会话诊断中核对。不会自动重发，也不等同任务成功。',tone:'warning'});
 return notices;
}

/** Ordinary composer submission is always nextTurn; busy input stays editable on Canvas. */
export function automaticDelivery(view:SessionView|undefined,online:boolean,now=Date.now(),readOnly=false) {
 const state=presentation(view,online,'nextTurn',now,readOnly);
 const pending=!!view?.queue?.items.some(i=>['pending','dispatching','submitted','unknown'].includes(i.state));
 const busy=view?.lifecycle==='ready'&&(state.active||view.snapshot?.status==='live'||state.pending.length>0);
 const enqueue=busy||pending||view?.lifecycle==='stopped'||view?.lifecycle==='interrupted';
 const pausedEnqueue=enqueue&&view?.lifecycle!=='ready';
 return {state,enqueue,pausedEnqueue,destination:(enqueue?'queue':'messages') as 'queue'|'messages',
  canSubmit:!readOnly&&online&&(enqueue?!!view:state.canSend)&&!view?.configurationPending&&!view?.configurationError};
}
/** One primary indicator: actionable abnormal states take precedence over context usage. */
export function sessionIndicator(view:SessionView|undefined,online:boolean,now=Date.now(),readOnly=false) {
 const state=presentation(view,online,'nextTurn',now,readOnly),config=view?.configuration,usage=config?.contextUsage;
 const queueUnknown=view?.queue?.items.some(i=>i.state==='unknown'||i.state==='rejected');
 const abnormal=state.tone==='danger'||!!state.warning||!!view?.configurationError||queueUnknown;
 const label=view?.configurationError?'配置未确认':queueUnknown?'派发未确认':state.label;
 const current=online&&!readOnly&&view?.lifecycle==='ready'&&['idle','live'].includes(view.snapshot?.status??'')&&!view.configurationPending&&!abnormal&&!state.pending.length&&config?.nativeSessionId===view.ref.nativeSessionId;
 const valid=!!usage&&usage.tokens!==null&&Number.isFinite(usage.tokens)&&usage.tokens>=0&&Number.isFinite(usage.contextWindow)&&usage.contextWindow>0&&usage.percent!==null&&Number.isFinite(usage.percent)&&usage.percent>=0&&(!config?.model?.contextWindow||config.model.contextWindow===usage.contextWindow);
 return {state,label,tone:abnormal?'danger':state.tone,usage:current&&valid?usage:undefined,confirmedAt:config?.confirmedAt,
  explanation:[label,state.reason,state.warning,view?.configurationError?'请重新回读配置核实':undefined,queueUnknown?'对应待发已冻结，不会自动重发':undefined].filter(Boolean).join(' · ')};
}

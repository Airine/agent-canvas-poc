import { useId, useState } from 'react';
import { Check, Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { ApprovalMode, RuntimeStatus, SessionView } from '../../../api/e/contracts';
import type { LiveStore } from './live-store';
import { redact } from './chat/error-presentation';
import { ChatPopover, ChatConfirm } from './chat/ChatPopover';
function ModeIcon({mode}:{mode:ApprovalMode}){const Icon=mode==='manual'?Shield:mode==='assisted'?ShieldCheck:ShieldAlert;return <Icon size={18} aria-hidden="true" data-mode-icon={mode}/>;}
export function ApprovalModeControl({store,nodeId,view}:{store:LiveStore;nodeId:string;view?:SessionView}) {
 const [configuring,setConfiguring]=useState(false),[catalog,setCatalog]=useState<RuntimeStatus['models']>([]),[selection,setSelection]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [confirm,setConfirm]=useState<{mode:ApprovalMode;reviewer?:{provider:string;model:string}}|null>(null);
 const tooltipId=useId();
 const mode=view?.approvalMode??'manual',online=store.connState==='online'&&!store.readOnly;
 async function setMode(next:ApprovalMode,reviewer?:{provider:string;model:string}){
  if(!store.workspaceId)return;setBusy(true);setError('');
  try{const res=await fetch(`/api/workspaces/${encodeURIComponent(store.workspaceId)}/nodes/${encodeURIComponent(nodeId)}/approval-mode`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:next,confirmRisk:next!=='manual',...(reviewer?{reviewer}:{})})});const data=await res.json();if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);store.sessions.apply(data.session);setConfiguring(false);}
  catch(e){setError(redact(String(e)));}finally{setBusy(false);setConfirm(null);}
 }
 async function choose(next:ApprovalMode){
  if(next==='manual'){setConfiguring(false);await setMode(next);return;}
  if(next==='full'){setConfiguring(false);setConfirm({mode:next});return;}
  setConfiguring(true);setError('');setBusy(true);
  try{const res=await fetch('/api/runtime/status');if(!res.ok)throw Error('无法读取审查模型目录');const data=await res.json() as RuntimeStatus;setCatalog(data.models);setSelection(view?.approvalReviewer?JSON.stringify(view.approvalReviewer):'');}
  catch(e){setError(redact(String(e)));}finally{setBusy(false);}
 }
 const labels={manual:'手动审批',assisted:'帮我审批',full:'Full Access'};
 const description=`权限：${labels[mode]}${mode==='full'?' · 高风险，本会话工具自动批准':''}${view?.sessionApprovalGrantCount?` · ${view.sessionApprovalGrantCount} 项精确授权`:''}`;
 return <><span className="chat-permission-entry"><ChatPopover id="permissions" label="权限设置" title={null} triggerProps={{'data-approval-mode':mode,'aria-describedby':tooltipId}} className={mode==='full'?'chat-permission-trigger is-risk':'chat-permission-trigger'} trigger={<ModeIcon mode={mode}/>}>
  <div className="chat-choice-list" role="group" aria-label="工具审批模式">{(['manual','assisted','full'] as const).map(value=><button type="button" data-chat-option key={value} className={`chat-choice ${value==='full'?'is-risk':''}`} aria-pressed={mode===value} disabled={!online||busy||value!=='manual'&&view?.lifecycle!=='ready'} onClick={()=>void choose(value)}>
   <ModeIcon mode={value}/><span className="chat-choice-copy"><strong>{labels[value]}</strong><small>{value==='manual'?'需要授权的工具逐条请求确认':value==='assisted'?'低风险白名单＋独立 AI 审查，其余转人工':'本会话内工具自动批准，不是沙箱'}</small></span>{mode===value&&<Check size={16}/>}</button>)}</div>
  {!online&&<p className="chat-muted">{store.readOnly?'工作区只读，不能修改权限。':'连接中断，当前不能修改权限。'}</p>}
  {mode==='full'&&<p className="chat-risk-note">Full Access · 本次会话。停止、恢复或 API 重启后回到手动；已提交操作不可撤回。</p>}
  {mode==='assisted'&&view?.approvalReviewer&&<p className="chat-muted">独立审查模型：{view.approvalReviewer.provider}/{view.approvalReviewer.model}</p>}
  {configuring&&<section className="chat-settings-section"><h4>独立审批审查模型</h4><p className="chat-muted">仅审查，无工具执行能力。失败或不确定转人工，不修改执行模型或 Pi 默认。</p>
   <select aria-label="审批审查模型" value={selection} disabled={busy} onChange={e=>setSelection(e.target.value)}><option value="">请选择审查模型</option>{catalog.map(m=><option key={`${m.provider}/${m.id}`} value={JSON.stringify({provider:m.provider,model:m.id})}>{m.provider}/{m.id}</option>)}</select>
   <div className="chat-actions"><button type="button" className="chat-primary" disabled={!selection||busy||!online} onClick={()=>setConfirm({mode:'assisted',reviewer:JSON.parse(selection)})}>启用辅助审批</button><button type="button" onClick={()=>setConfiguring(false)}>取消设置</button></div>
  </section>}
  <details className="chat-settings-section"><summary>授权范围与记录{view?.sessionApprovalGrantCount?` · 精确授权 ${view.sessionApprovalGrantCount}`:''}</summary><p className="chat-muted">精确授权绑定当前请求摘要与运行实例，在原审批请求中管理。白名单仅含有限只读操作；复杂 shell、删除、凭据、网络传输、安装、Git 写操作与大范围覆盖始终人工。</p>
   {view?.approvalAudit?.slice(-12).map((a,i)=><p key={`${a.at}-${i}`} data-testid="approval-audit" className="chat-muted">{a.source==='ai'?'AI':a.source==='whitelist'?'白名单':a.source==='full'?'Full Access':'人工'} · {{reviewing:'审查中',manual:'需人工确认',submitting:'提交中',submitted:'已提交',cancelled:'已失效',failed:'转人工'}[a.state]}：{redact(a.reason)}</p>)}
  </details>{error&&<p role="alert" className="chat-error">{error}</p>}
 </ChatPopover><span className="chat-permission-tooltip chat-control-tooltip" id={tooltipId} role="tooltip">{description}</span></span><ChatConfirm open={!!confirm} title={confirm?.mode==='full'?'开启本会话 Full Access？':'开启辅助审批？'} danger={confirm?.mode==='full'} busy={busy} confirmLabel={confirm?.mode==='full'?'确认开启 Full Access':'确认启用辅助审批'} onCancel={()=>setConfirm(null)} onConfirm={()=>{if(confirm)void setMode(confirm.mode,confirm.reviewer);}} description={confirm?.mode==='full'?'所有当前待处理及后续工具审批都会自动批准，可能执行命令、修改或删除文件。它不是沙箱，不会提升操作系统权限。停止、恢复或 API 重启后回到手动；已提交操作无法撤回。':`精确低风险白名单自动批准，其余可审查操作将调用独立审查模型 ${confirm?.reviewer?.provider??''}/${confirm?.reviewer?.model??''}（可能产生费用）。高风险、未知、超时及失败转人工。授权仅对当前会话运行有效。`}/></>;
}

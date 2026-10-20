import type { ToolDisplay } from './model';
import type { ChatUIStore } from './chat-ui-store';
import { Disclosure,Output } from './primitives';
import { redact } from './error-presentation';
import { approvalLabel } from './presentation-state';
const labels:Record<string,string>={pending:'等待执行',running:'执行中',completed:'已结束',failed:'执行失败',cancelled:'已中断'};
export function ToolActivity({activity,ui}:{activity:ToolDisplay;ui:ChatUIStore}) {
 const {tool,approvals}=activity;const args=tool.arguments as Record<string,unknown>|undefined;
 const summary=redact([args?.command,args?.path,args?.file_path,args?.pattern,args?.query,args?.target,args?.title].find(value=>typeof value==='string')??'').replace(/\s+/g,' ').slice(0,140);
 const failed=tool.state==='failed'||tool.isError;const pending=approvals.some(a=>a.state==='pending');
 return <div className={`chat-tool ${failed?'chat-tool-failed':''}`} data-tool-id={tool.id}>
 <Disclosure ui={ui} id={`tool:${tool.id}`} label={<><span className={`chat-dot ${failed?'error':tool.state==='running'?'active':''}`}/><span className="chat-tool-name">{tool.name}</span><span className="chat-tool-summary">{summary}</span><span className="chat-tool-state chat-muted">{pending?'等待批准':failed?'执行失败':approvals.some(a=>a.state==='rejected')?'已拒绝':labels[tool.state]??'未知状态'}</span></>}>
  <div className="chat-tool-metadata">{approvals.filter(a=>a.state!=='pending').map(a=><span key={a.id} className="chat-resolved">{approvalLabel[a.state]??a.state}</span>)}{tool.createdAt&&<span className="chat-muted">请求时间：{tool.createdAt}</span>}</div>
  <p className="chat-eyebrow">输入</p><Output text={redact(tool.arguments??{})}/>
  <p className="chat-eyebrow">输出</p><Output text={redact(tool.result??tool.partialResult??'尚无结果')}/>
 </Disclosure>
 </div>;
}

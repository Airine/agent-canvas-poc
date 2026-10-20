import { Ellipsis } from 'lucide-react';
import { memo } from 'react';
import { sourceLabel,modelLabel } from './message-metadata';
import type { TranscriptTurn, TurnPart } from './model';
import type { ChatUIStore } from './chat-ui-store';
import { MarkdownContent } from './MarkdownContent';
import { CopyButton,Disclosure,Output } from './primitives';
import { ExecutionGroup } from './ExecutionGroup';
import { isExecutionOnly,isProcessPart } from './execution-presentation';
import { errorTitle,redact } from './error-presentation';
import { approvalLabel } from './presentation-state';
function ErrorNotice({error,ui,id}:{error:unknown;ui:ChatUIStore;id:string}){return <div className="chat-error" role="status"><strong>{errorTitle(error)}</strong><Disclosure ui={ui} id={id} label="查看脱敏详情"><Output text={redact(error)}/><CopyButton text={redact(error)} label="复制诊断"/></Disclosure></div>;}
export const TurnView=memo(function TurnView({turn,ui,live}:{turn:TranscriptTurn;ui:ChatUIStore;live:boolean}) {
 const processOnly=isExecutionOnly(turn);const streaming=live&&turn.messages.some(m=>m.state==='running');const segments:Array<{id:string;process:boolean;parts:TurnPart[]}>=[];
 for(const part of turn.parts){if(part.kind==='text'&&!part.text.trim())continue;const process=isProcessPart(part);const prior=segments.at(-1);if(process&&prior?.process)prior.parts.push(part);else segments.push({id:part.id,process,parts:[part]});}
 const models=[...new Set(turn.messages.map(modelLabel).filter(Boolean))];
 const time=Number.isFinite(Date.parse(turn.timestamp))?new Date(turn.timestamp):undefined;
 const errors=turn.parts.filter(p=>p.kind==='error');
 const content=(turn.sourceTurns??[turn]).flatMap(source=>source.parts.flatMap(p=>p.kind==='text'?[p.text]:[])).join('\n');
 return <article className={`chat-turn chat-turn-${turn.role}${processOnly?' chat-turn-process':''}`} data-entry-id={turn.id} data-testid={`message-${turn.role}`}>
  {turn.role!=='assistant'&&<header className="chat-turn-heading"><span>{turn.role==='user'?sourceLabel(turn.messages[0]):turn.orphan?'未关联活动':'会话记录'}</span></header>}
  {segments.map(segment=>segment.process?<ExecutionGroup key={segment.id} id={`process:${turn.id}:${segment.id}`} parts={segment.parts} turn={turn} ui={ui} live={live}/>
  :segment.parts.map(part=>part.kind==='text'?<MarkdownContent key={part.id} text={part.text} streaming={streaming}/>:part.kind==='error'&&part===errors[0]?<div key={part.id}><ErrorNotice error={part.error} id={part.id} ui={ui}/>{errors.length>1&&<Disclosure ui={ui} id={`errors:${turn.id}`} label={`本轮另有 ${errors.length-1} 次请求错误`}><Output text={redact(errors.slice(1).map(p=>p.kind==='error'?p.error:null))}/></Disclosure>}</div>:null))}
  {!processOnly&&!turn.hideFooter&&<footer className="chat-turn-footer">{content&&<CopyButton iconOnly text={content} label={turn.role==='assistant'?'复制回复':'复制消息'}/>} {time&&<time dateTime={turn.timestamp} title={turn.timestamp}>{time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time>}<details className="chat-message-details"><summary aria-label="消息详情" title="消息详情"><Ellipsis size={16}/></summary>{models.length>0&&<p className="chat-muted">本条消息模型：{models.join(' · ')}</p>}<Output text={redact({messages:turn.messages.map(m=>({id:m.id,role:m.role,state:m.state,origin:m.origin,provenance:m.provenance,model:m.model,createdAt:m.createdAt,updatedAt:m.updatedAt})),runId:turn.runId,turnId:turn.turnId})}/></details></footer>}
  {!processOnly&&turn.approvals.filter(a=>a.state!=='pending').map(a=><p key={a.id} className="chat-resolved">{approvalLabel[a.state]??a.state} · {a.toolName??a.kind}</p>)}
 </article>;
});

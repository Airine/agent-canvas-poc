import { useState } from 'react';
import type { TranscriptTurn, TurnPart } from './model';
import type { ChatUIStore } from './chat-ui-store';
import { Disclosure,Output } from './primitives';
import { ToolActivity } from './ToolActivity';
import { MarkdownContent } from './MarkdownContent';
import { redact } from './error-presentation';
import { toolDuration } from './message-metadata';
import { executionSummary } from './execution-presentation';

export function ExecutionGroup({id,parts,turn,ui,live}:{id:string;parts:TurnPart[];turn:TranscriptTurn;ui:ChatUIStore;live:boolean}){
 const [window,setWindow]=useState(()=>({start:Math.max(0,parts.length-20),size:20,opened:!!ui.getSnapshot().expanded[id]}));
 const summary=executionSummary(parts,turn.messages.some(m=>m.state==='running'),live);
 const duration=toolDuration(summary.tools),start=Math.min(window.start,Math.max(0,parts.length-1)),end=Math.min(parts.length,start+window.size);
 const sources=turn.sourceTurns??[turn];
 return <div className="chat-execution" data-execution-group={id} data-execution-tone={summary.tone||'neutral'}>
  <Disclosure ui={ui} id={id} onToggle={open=>{if(open&&!window.opened)setWindow({start:Math.max(0,parts.length-20),size:20,opened:true});}} label={<><span className={`chat-dot ${summary.tone}`}/><span className="chat-execution-title">{summary.title}</span>{summary.count&&<span className="chat-execution-count">{summary.count}</span>}{summary.state&&['error','warning'].includes(summary.tone)&&<span className={`chat-execution-state ${summary.tone}`}>{summary.state}</span>}<span className="chat-execution-description" title={summary.description}>{summary.description}</span></>}>
   {summary.breakdown&&<p className="chat-execution-breakdown">{summary.breakdown}</p>}
   {start>0&&<button type="button" className="chat-quiet chat-execution-earlier" onClick={()=>setWindow(w=>({...w,start:Math.max(0,start-20),size:w.size+Math.min(start,20)}))}>显示更早步骤（还有 {start} 项）</button>}
   <div className="chat-execution-steps">{parts.slice(start,end).map(part=><div key={part.id} className="chat-execution-step">
    {part.kind==='tool'?<ToolActivity activity={part.activity} ui={ui}/>:part.kind==='thinking'?<Disclosure ui={ui} id={`thinking:${part.id}`} label="思考"><MarkdownContent text={part.text}/></Disclosure>:part.kind==='unknown'?<Disclosure ui={ui} id={`unknown:${part.id}`} label={`未支持的内容 · ${part.block.type}`}><Output text={redact(part.block)}/></Disclosure>:null}
   </div>)}</div>
   {end<parts.length&&<button type="button" className="chat-quiet chat-execution-newer" onClick={()=>setWindow(w=>({...w,start:Math.max(0,parts.length-w.size)}))}>查看新增步骤（{parts.length-end} 项）</button>}
   <div className="chat-execution-details"><Disclosure ui={ui} id={`execution-info:${id}`} label="执行详情">
    {duration&&<p className="chat-muted">工具记录时间跨度：{duration}（不是耗时相加）</p>}
    <Output text={redact(sources.map(source=>({runId:source.runId,turnId:source.turnId,timestamp:source.timestamp,orphan:source.orphan,approvals:source.approvals,messages:source.messages.map(m=>({id:m.id,role:m.role,state:m.state,origin:m.origin,provenance:m.provenance,model:m.model,createdAt:m.createdAt,updatedAt:m.updatedAt}))})))}/>
   </Disclosure></div>
  </Disclosure>
 </div>;
}

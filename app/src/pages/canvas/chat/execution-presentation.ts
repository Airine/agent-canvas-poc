import { describeExecution } from './execution-description';
import type { TranscriptTurn, TurnPart } from './model';

export const isProcessPart=(part:TurnPart)=>part.kind==='tool'||part.kind==='thinking'||part.kind==='unknown';
export const isExecutionOnly=(turn:TranscriptTurn)=>['assistant','activity'].includes(turn.role)&&turn.parts.some(isProcessPart)&&turn.parts.every(part=>isProcessPart(part)||part.kind==='text'&&!part.text.trim());
const fragments=new WeakMap<TranscriptTurn,TranscriptTurn[]>();
/** Split mixed messages at visible content boundaries BEFORE folding adjacent execution.
 * This is a view fragment, never a new canonical message/turn or a guessed tool association.
 */
function executionFragments(turn:TranscriptTurn):TranscriptTurn[]{
 if(turn.role!=='assistant'||turn.orphan)return [turn];
 const cached=fragments.get(turn);if(cached)return cached;
 const segments:Array<{process:boolean;parts:TurnPart[]}>=[];
 for(const part of turn.parts){
  if(part.kind==='text'&&!part.text.trim())continue;
  const process=isProcessPart(part),last=segments.at(-1);
  if(last?.process===process)last.parts.push(part);else segments.push({process,parts:[part]});
 }
 if(segments.length<2)return [turn];
 const owner=segments.reduce((last,segment,index)=>segment.process?last:index,-1);
 const result=segments.map((segment,index)=>({...turn,
  id:index===0?turn.id:`fragment:${JSON.stringify([turn.id,segment.parts[0].id])}`,
  parts:segment.parts,hideFooter:index!==owner,
  approvals:index===segments.length-1?turn.approvals:[],sourceTurns:turn.sourceTurns??[turn],
 }));
 fragments.set(turn,result);return result;
}
const cache=new WeakMap<TranscriptTurn,{sources:TranscriptTurn[];value:TranscriptTurn}>();
/** Presentation only. Adjacent internal steps are folded, never reassociated in the source snapshot. */
export function groupExecutionTurns(turns:TranscriptTurn[]):TranscriptTurn[]{
 const result:TranscriptTurn[]=[];let pending:TranscriptTurn[]=[];
 const flush=()=>{
  if(!pending.length)return;
  const sources=pending,first=sources[0];pending=[];
  if(sources.length===1){result.push(first);return;}
  const prior=cache.get(first);
  if(prior&&prior.sources.length===sources.length&&sources.every((turn,i)=>turn===prior.sources[i])){result.push(prior.value);return;}
  const value:TranscriptTurn={...first,turnId:sources.every(turn=>turn.turnId===first.turnId)?first.turnId:undefined,
   messages:sources.flatMap(turn=>turn.messages),parts:sources.flatMap(turn=>turn.parts.filter(isProcessPart)),approvals:sources.flatMap(turn=>turn.approvals),sourceTurns:[...new Set(sources.flatMap(turn=>turn.sourceTurns??[turn]))]};
  cache.set(first,{sources,value});result.push(value);
 };
 for(const turn of turns.flatMap(executionFragments)){
  // Orphans remain visibly unassociated. Known/unknown or different runs must not be merged.
  if(!isExecutionOnly(turn)||turn.orphan){flush();result.push(turn);continue;}
  if(pending.length&&pending[0].runId!==turn.runId)flush();
  pending.push(turn);
 }
 flush();return result;
}
export function executionSummary(parts:TurnPart[],streaming=false,live=true){
 const tools=parts.flatMap(part=>part.kind==='tool'?[part.activity]:[]);
 const failures=tools.filter(({tool})=>tool.state==='failed'||tool.isError).length;
 const pending=tools.filter(({approvals})=>approvals.some(a=>a.state==='pending')).length;
 const rejected=tools.filter(({approvals})=>approvals.some(a=>a.state==='rejected')).length;
 const running=tools.filter(({tool})=>tool.state==='running').length;
 const waiting=tools.some(({tool})=>tool.state==='pending');
 const cancelled=tools.filter(({tool})=>tool.state==='cancelled').length;
 const unknown=tools.some(({tool})=>!['running','pending','completed','failed','cancelled'].includes(tool.state));
 const names=new Map<string,number>();for(const {tool} of tools)names.set(tool.name,(names.get(tool.name)??0)+1);
 const kinds=[...names].slice(0,3).map(([name,count])=>`${name}${count>1?` ×${count}`:''}`).join(' · ')+(names.size>3?' …':'');
 const thinking=parts.filter(part=>part.kind==='thinking').length;
 const unsupported=parts.filter(part=>part.kind==='unknown').length;
 const title=tools.length?'执行过程':unsupported?'过程记录':'思考过程';
 const count=tools.length?`${tools.length} 个工具`:unsupported?`${unsupported} 项内容`:'';
 const breakdown=[kinds,thinking?`${thinking} 段思考`:'',unsupported?`${unsupported} 项其他内容`:''].filter(Boolean).join(' · ');
 const state=failures?`${failures} 个工具失败`:rejected?`${rejected} 项被拒绝`:pending?'等待批准':!live&&(running||waiting||streaming)?'状态待确认':running?'执行中':waiting?'等待执行':streaming?'思考中':cancelled?'含已中断步骤':unknown?'状态未确认':tools.length?'已结束':'';
 const tone=failures||rejected?'error':pending||unknown||cancelled||!live&&(running||waiting||streaming)?'warning':running||streaming?'active':'';
 return {tools:tools.map(({tool})=>tool),title,breakdown,count,state,tone,description:describeExecution(parts,streaming,live)};
}

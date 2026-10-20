import type { SessionSnapshot, SessionMessage, SessionTool, SessionApproval } from '../../../../api/e/contracts';
import type { TranscriptTurn, ToolDisplay } from './model';

function unique<T extends {id: string; revision?: number}>(items: T[]): T[] {
 const map=new Map<string,T>();for(const x of items)if(!map.has(x.id)||(x.revision??0)>=(map.get(x.id)?.revision??0))map.set(x.id,x);return [...map.values()];
}
/** Bounded per-conversation cache. No input mutations and stable entity keys. */
export class TranscriptProjector {
 private cache=new Map<string,{signature:string;value:TranscriptTurn}>();
 project(snapshot?: SessionSnapshot): TranscriptTurn[] {
  if(!snapshot)return [];
  const messages=unique(snapshot.messages), tools=new Map(unique(snapshot.tools).map(t=>[t.id,t]));
  const approvals=unique(snapshot.approvals??[]);
  const approvalByTool=new Map<string,SessionApproval[]>();
  for(const a of approvals)if(a.toolCallId)approvalByTool.set(a.toolCallId,[...(approvalByTool.get(a.toolCallId)??[]),a]);
  // Tool-result messages supplement the canonical entity; render it only once.
  const resultMessages=new Map<string,SessionMessage>();
  for(const m of messages)if(m.role==='tool'&&m.toolCallId)resultMessages.set(m.toolCallId,m);
  const declaredTools=new Set(messages.flatMap(m=>m.blocks.flatMap(b=>b.type==='tool-call'&&typeof b.toolCallId==='string'?[b.toolCallId]:[])));
  const consumed=new Set<string>(), claimedApprovals=new Set<string>(), groups=new Map<string,TranscriptTurn>();
  const segments=new Map<string,number>();const segmentKeys=new Map<string,string>();let previousGroup='';
  const turnMeta=new Map((snapshot.turns??[]).map(t=>[t.id,t]));
  const runTimes=new Map(snapshot.runs.map(r=>[r.id, typeof r.startedAt==='string'?r.startedAt:'']));
  const ordered=[...messages].sort((a,b)=>a.runId===b.runId&&a.turnId===b.turnId ? a.order-b.order || (a.createdAt??'').localeCompare(b.createdAt??'') || a.id.localeCompare(b.id) : (a.createdAt??'').localeCompare(b.createdAt??'') || a.id.localeCompare(b.id));
  const activity=(id:string, fallback?:Partial<SessionTool>, linked=true):ToolDisplay=>{
   const result=resultMessages.get(id);
   const source=tools.get(id);const tool=source?{...source,result:source.result??result?.blocks,arguments:source.arguments??fallback?.arguments}:{id,name:fallback?.name??'工具',state:result?.error?'failed':result?'completed':'pending',arguments:fallback?.arguments,result:result?.blocks,...fallback};
   const list=approvalByTool.get(id)??[];for(const a of list)claimedApprovals.add(a.id);
   consumed.add(id);return {id,tool,approvals:list,linked};
  };
  for(const m of ordered){
   if(m.role==='system')continue;
   if(m.role==='tool'&&m.toolCallId)continue;
   const base=m.role==='assistant'&&m.turnId ? `turn:${m.runId??''}:${m.turnId}` : `message:${m.id}`;
   if(base!==previousGroup){const segment=(segments.get(base)??-1)+1;segments.set(base,segment);segmentKeys.set(base,segment?`${base}:segment:${m.id}`:base);previousGroup=base;}
   const key=segmentKeys.get(base)!;
   let turn=groups.get(key);
   if(!turn){turn={id:key,role:m.role,runId:m.runId,turnId:m.turnId,timestamp:m.createdAt??turnMeta.get(m.turnId??'')?.startedAt??runTimes.get(m.runId??'')??'',messages:[],parts:[],approvals:[],orphan:false};groups.set(key,turn);}
   turn.messages.push(m);
   for(const [index,block] of m.blocks.entries()){
    const id=`${m.id}:${index}`;
    if(block.type==='text'||block.type==='thinking'){if(block.text)turn.parts.push({id,kind:block.type,text:block.text});}
    else if(block.type==='tool-call'&&typeof block.toolCallId==='string'){
     if(!consumed.has(block.toolCallId))turn.parts.push({id:`tool:${block.toolCallId}`,kind:'tool',activity:activity(block.toolCallId,{name:typeof block.name==='string'?block.name:'工具',arguments:block.arguments})});
    }else if(block.type==='tool-result'&&typeof block.toolCallId==='string'){
     if(!consumed.has(block.toolCallId)&&!tools.has(block.toolCallId)&&!declaredTools.has(block.toolCallId))turn.parts.push({id:`tool:${block.toolCallId}`,kind:'tool',activity:activity(block.toolCallId,{result:block.content,state:block.isError?'failed':'completed'})});
    }else if(block.type==='error')turn.parts.push({id,kind:'error',error:block.message??block});
    else turn.parts.push({id,kind:'unknown',block});
   }
   if(m.stopReason==='aborted'||m.state==='cancelled')turn.parts.push({id:`cancel:${m.id}`,kind:'text',text:'本次回复已中断。'});
   else if(m.error||m.stopReason==='error')turn.parts.push({id:`error:${m.id}`,kind:'error',error:m.error??'模型返回错误结束状态'});
   for(const tool of tools.values())if(tool.parentMessageId===m.id&&!consumed.has(tool.id))turn.parts.push({id:`tool:${tool.id}`,kind:'tool',activity:activity(tool.id)});
  }
  // A turnId is an explicit association; otherwise retain as unassociated activity.
  const byTurn=new Map([...groups.values()].filter(t=>t.role==='assistant'&&t.turnId).map(t=>[`${t.runId??''}/${t.turnId}`,t]));
  const orphan=(id:string,time:string):TranscriptTurn=>{const t:TranscriptTurn={id:`activity:${id}`,role:'activity',timestamp:time,messages:[],parts:[],approvals:[],orphan:true};groups.set(t.id,t);return t;};
  for(const tool of tools.values())if(!consumed.has(tool.id)){
   const turn=byTurn.get(`${tool.runId??''}/${tool.turnId}`)??orphan(tool.id,tool.createdAt??'');
   turn.parts.push({id:`tool:${tool.id}`,kind:'tool',activity:activity(tool.id,undefined,!turn.orphan)});
  }
  for(const [id,m] of resultMessages)if(!consumed.has(id))orphan(id,m.createdAt??'').parts.push({id:`tool:${id}`,kind:'tool',activity:activity(id,undefined,false)});
  for(const a of approvals)if(!claimedApprovals.has(a.id)){
   const turn=byTurn.get(`${a.runId??''}/${a.turnId}`)??orphan(a.id,a.requestedAt??'');turn.approvals.push(a);claimedApprovals.add(a.id);
  }
  const result=[...groups.values()].filter(t=>t.parts.length||t.approvals.length).sort((a,b)=>a.runId===b.runId&&a.turnId===b.turnId&&a.messages.length&&b.messages.length ? a.messages[0].order-b.messages[0].order||a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id) : a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id));
  const next=new Map<string,{signature:string;value:TranscriptTurn}>();
  for(let i=0;i<result.length;i++){const value=result[i],signature=JSON.stringify(value),prior=this.cache.get(value.id);if(prior?.signature===signature)result[i]=prior.value;next.set(value.id,{signature,value:result[i]});}
  this.cache=next;return result;
 }
}

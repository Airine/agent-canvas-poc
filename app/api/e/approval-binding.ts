import { createHash } from 'node:crypto';
import type { SessionSnapshot, SessionApproval } from './contracts.js';
export interface ApprovalInput { approval: SessionApproval; tool: string; args?: Record<string,unknown>; complete: boolean; digest: string }
function stable(value: unknown): string { if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;return JSON.stringify(value)??'null'; }
export function exactOperationKey(tool:string,args:unknown):string {
 return createHash('sha256').update(stable({tool,args})).digest('hex');
}
export function bindApproval(snapshot: SessionSnapshot, id: string): ApprovalInput | undefined {
 const approval=snapshot.approvals?.find(a=>a.id===id&&a.state==='pending');if(!approval)return;
 const tool=snapshot.tools.find(t=>t.id===approval.toolCallId);
 const blocks=snapshot.messages.flatMap(m=>m.blocks).filter(b=>b.type==='tool-call'&&b.toolCallId===approval.toolCallId);
 const raw=tool?.arguments??blocks[0]?.arguments;
 const args=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:undefined;
 const name=approval.toolName??tool?.name??(typeof blocks[0]?.name==='string'?blocks[0].name:approval.kind);
 const candidates=[tool?.arguments,...blocks.map(b=>b.arguments)].filter(v=>v!==undefined);
 const consistent=candidates.every(v=>stable(v)===stable(raw));
 const names=[approval.toolName,tool?.name,...blocks.map(b=>b.name)].filter(v=>v!==undefined);
 const complete=!!approval.toolCallId&&!!args&&consistent&&names.every(n=>n===name)&&stable(args).length<=24000;
 const digest=createHash('sha256').update(stable({epoch:snapshot.epoch,native:snapshot.nativeSessionId,approval,tool:name,args:raw})).digest('hex');
 return {approval,tool:name,args,complete,digest};
}

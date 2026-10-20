import { randomUUID } from 'node:crypto';
import type { SessionView, ApprovalMode, ApprovalAudit } from './contracts.js';
import { bindApproval, exactOperationKey, type ApprovalInput } from './approval-binding.js';
import { approvalRule, type RuleDecision } from './approval-rules.js';
import { reviewApproval, type ReviewRequest, type ReviewResult, type ReviewerConfig } from './approval-reviewer.js';
interface Host {
 get():SessionView;
 record(entry:ApprovalAudit):void;
 approve(input:ApprovalInput,intent:string):Promise<unknown>;
}
interface Services {rule?:(input:ApprovalInput,cwd:string)=>RuleDecision;review?:(request:ReviewRequest)=>Promise<ReviewResult>}
/** Authorization is scoped to one live session instance; never restored from disk. */
export class ApprovalEngine {
 private generation=randomUUID();private mode:ApprovalMode='manual';private reviewer?:ReviewerConfig;
 private grants=new Set<string>();
 private grantKey(input:ApprovalInput){const v=this.host.get();return JSON.stringify([v.ref.nativeSessionId,v.snapshot?.epoch,v.ref.cwd,exactOperationKey(input.tool,input.args)]);}
 get grantCount(){return this.grants.size;}
 grantExact(input:ApprovalInput){
  const v=this.host.get();
  if(v.lifecycle!=='ready'||!input.complete||!['bash','write','edit'].includes(input.tool)||!v.snapshot||bindApproval(v.snapshot,input.approval.id)?.digest!==input.digest)throw new Error('complete unchanged pending approval required');
  if(this.grants.size>=100)throw new Error('session grant limit reached');
  this.manual(input.approval.id);
  this.overridden.delete(input.approval.id);
  this.seen.delete(`${this.generation}:${input.digest}`);
  this.grants.add(this.grantKey(input));
 }
 private jobs=new Map<string,AbortController>();private seen=new Set<string>();private overridden=new Set<string>();
 constructor(private host:Host,private services:Services={}){}
 set(mode:ApprovalMode,reviewer?:ReviewerConfig){this.reset();this.mode=mode;this.reviewer=reviewer;}
 reset(){this.generation=randomUUID();this.mode='manual';this.reviewer=undefined;for(const job of this.jobs.values())job.abort();this.jobs.clear();this.seen.clear();this.overridden.clear();this.grants.clear();}
 manual(approvalId:string){this.overridden.add(approvalId);this.jobs.get(approvalId)?.abort();this.jobs.delete(approvalId);}
 observe(){
  const v=this.host.get();const s=v.snapshot;
  if(v.lifecycle!=='ready'||!s){this.reset();return;}
  for(const [id,job] of this.jobs)if(!s.approvals?.some(a=>a.id===id&&a.state==='pending')){job.abort();this.jobs.delete(id);}
  if(this.mode==='manual'&&!this.grants.size)return;
  if(!s.capabilities.some(c=>c.name==='approval.resolve'&&c.available&&c.authority==='authoritative'&&(!c.expiresAt||Date.parse(c.expiresAt)>Date.now())))return;
  for(const a of s.approvals??[]){
   if(a.state!=='pending'||this.overridden.has(a.id))continue;
   const input=bindApproval(s,a.id);if(!input)continue;
   const granted=input.complete&&this.grants.has(this.grantKey(input));
   if(this.mode==='manual'&&!granted)continue;
   const key=`${this.generation}:${input.digest}`;if(this.seen.has(key))continue;
   this.seen.add(key);this.jobs.get(a.id)?.abort();
   const controller=new AbortController();this.jobs.set(a.id,controller);
   void this.evaluate(input,this.generation,s.epoch,v.ref.nativeSessionId,this.mode,this.reviewer,controller,granted).finally(()=>{if(this.jobs.get(a.id)===controller)this.jobs.delete(a.id);});
  }
 }
 private async evaluate(input:ApprovalInput,generation:string,epoch:string,native:string,mode:ApprovalMode,reviewer:ReviewerConfig|undefined,job:AbortController,granted=false){
  let source:ApprovalAudit['source']=granted?'whitelist':mode==='full'?'full':'manual';let rule:string|undefined=granted?'session-exact-v1':undefined;
  const report=(state:ApprovalAudit['state'],reason:string)=>this.host.record({approvalId:input.approval.id,digest:input.digest,source,state,reason:reason.slice(0,600),rule,at:new Date().toISOString(),...(source==='ai'&&reviewer?{reviewer}:{})});
  const current=()=>{const v=this.host.get();const s=v.snapshot;return !job.signal.aborted&&generation===this.generation&&v.lifecycle==='ready'&&s?.epoch===epoch&&v.ref.nativeSessionId===native&&!this.overridden.has(input.approval.id)&&bindApproval(s,input.approval.id)?.digest===input.digest;};
  try{
   let reason=granted?'用户明确授权：当前会话内相同工具及完整参数（非正则匹配）':'用户明确开启当前会话 Full Access';
   if(!granted&&mode!=='full'){
    const result=(this.services.rule??approvalRule)(input,this.host.get().ref.cwd);rule=result.rule;reason=result.reason;
    if(result.route==='manual'){report('manual',reason);return;}
    if(result.route==='allow')source='whitelist';
    else {
     source='ai';if(!reviewer){report('manual','未配置独立审查模型');return;}
     const view=this.host.get();const task=[...(view.snapshot?.messages??[])].filter(m=>m.role==='user').sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'')||b.order-a.order)[0]?.blocks.filter(b=>b.type==='text').map(b=>b.text??'').join('\n')??'';
     if(!task.trim()||task.length>12000){report('manual','任务上下文缺失或过长，转人工');return;}
     report('reviewing','独立 AI 审查中；可随时人工批准/拒绝');
     const review=await (this.services.review??reviewApproval)({input,task,cwd:view.ref.cwd,reviewer,signal:job.signal});
     if(!current()){report('cancelled','审查已失效：模式、参数、会话或人工决定发生变化');return;}
     if(review.decision!=='approve'||review.risk!=='low'){report('manual',review.reason);return;}
     reason=review.reason;
    }
   }
   if(!current()){report('cancelled','审批已失效，未提交');return;}
   // Recheck filesystem boundary immediately before authorization; reviewer cannot waive rules.
   if(!granted&&mode!=='full'&&(this.services.rule??approvalRule)(input,this.host.get().ref.cwd).route==='manual'){report('manual','路径或目标文件状态已变化，需人工确认');return;}
   report('submitting',reason);
   await this.host.approve(input,`policy:${generation}:${input.digest}`);
   report('submitted',`${reason}；已提交到 e，执行状态以真实审批记录为准`);
  }catch(error){
   if(!current()){report('cancelled','审查取消或请求已变化，未自动重试');return;}
   report('failed',source==='ai'?'AI审查或批准请求失败，已转人工，未重试':`自动批准未获确认，转人工，未重试${error instanceof Error&&/timeout/i.test(error.message)?'（超时）':''}`);
  }
 }
}

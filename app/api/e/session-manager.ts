import fs from 'node:fs';
import { readCollaborationPackage } from '../../shared/collaboration-package.mjs';
import { COLLABORATION_PROTOCOL_VERSION, CollaborationError, collaborationError, validateCollaborationHello, validateCollaborationResult } from '../../shared/collaboration-protocol.mjs';
import type { CollaborationManifest, CollaborationStatus } from '../../shared/collaboration-protocol.mjs';
import { associateMessageOrigins, type OriginBinding } from './message-origins.js';
import { CollaborationStore } from './collaboration.js';
import { authorizeCollaboration } from './collaboration-authorization.js';
import type { CollaborationRequest } from './collaboration-contracts.js';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { emptyQueue, mutateQueue, pauseQueue, queueReady, reconcileQueue } from './message-queue.js';
import { validateMessage } from './attachments.js';
import type { ConfigurationChange, RuntimeConfiguration, QueueMutation, QueueItem, MessageOrigin } from './contracts.js';
import { ApprovalEngine } from './approval-engine.js';
import { APPROVAL_POLICY_VERSION } from './approval-rules.js';
import type { ApprovalMode } from './contracts.js';
import type { ReviewerConfig } from './approval-reviewer.js';
import { bindApproval } from './approval-binding.js';
import type { SessionView, SessionSnapshot, SessionRef, ControlOperation, ControlPayload } from './contracts.js';
import { APP_ROOT, DATA_ROOT, MAX_SESSIONS, runtimeConfig, runtimeStatus } from './config.js';

interface WorkerMessage { request?: CollaborationRequest; collaboration?: CollaborationStatus; type: string; id?: string; error?: string; snapshot?: SessionSnapshot; ref?: SessionRef; result?: unknown; configuration?: RuntimeConfiguration; origins?: Record<string, MessageOrigin> }
interface ActionRecord { signature: string; result?: unknown; error?: string; pending?: boolean }
interface RecordData { view: SessionView; intents: Record<string, ActionRecord>; started: boolean; queueMutations?: Record<string,string>; origins?: Record<string,MessageOrigin>; intentOrigins?: Record<string,MessageOrigin>; originBindings?: Record<string,OriginBinding>; spawnTask?: { content: string; spawnId: string; origin: MessageOrigin } }
interface Running { child: ChildProcess; stopping: boolean; pending: Map<string, {resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>; readyReject?: (e:Error)=>void; closed: Promise<void> }
interface Options { dataDir?: string; workerPath?: string; startupMs?: number; controlMs?: number; maxSessions?: number; skipPreflight?: boolean }

export class SessionManager extends EventEmitter {
  private records = new Map<string, RecordData>();
  private workers = new Map<string, Running>();
  private controls = new Map<string, Promise<unknown>>();
  private queueJobs = new Set<string>();
  private configurationJobs = new Set<string>();
  private loaded = false;
  private launching = new Set<string>();
  private cancelled = new Set<string>();
  private closing = false;
  private approvalEngines = new Map<string, ApprovalEngine>();
  readonly dataDir: string;
  readonly collaboration: CollaborationStore;
  constructor(readonly options: Options = {}) {
    super(); this.dataDir = options.dataDir ?? path.join(DATA_ROOT, 'e');
    this.collaboration = new CollaborationStore(path.join(this.dataDir, 'collaboration.json'), {
      list: wid => this.list(wid),
      changed: wid => this.emit('communication', wid),
      enqueue: (target, id, content, origin) => {
        const record = this.record(target.workspaceId, target.nodeId);record.view.queue ??= emptyQueue();
        const q = record.view.queue;
        const authorize = record.view.lifecycle === 'ready' && (!q.paused || q.reason === '待发尚未授权继续');
        mutateQueue(q, { mutationId: id, expectedRevision: q.revision, operation: 'add', itemId: id, content, authorize });
        q.items.find(i => i.id === id)!.origin = origin;
        record.intentOrigins ??= Object.create(null);record.intentOrigins![`queue:${id}`] = origin;
        this.changed(record);
      },
      spawn: input => this.spawn(input),
    });
  }
  private key(wid: string, nid: string) { return `${wid}/${nid}`; }
  private load() {
    if (this.loaded) return; this.loaded = true;
    if (!fs.existsSync(this.dataDir)) return;
    for (const dir of fs.readdirSync(this.dataDir)) {
      if (!/^n-[a-zA-Z0-9-]+$/.test(dir)) continue;
      try {
        const record = JSON.parse(fs.readFileSync(path.join(this.dataDir, dir, 'record.json'), 'utf8')) as RecordData;
        if (record.view.nodeId !== dir || !record.view.workspaceId || !record.view.ref.nativeSessionId) continue;
        if (['ready', 'starting'].includes(record.view.lifecycle)) record.view.lifecycle = 'interrupted';
        record.view.queue ??= emptyQueue();pauseQueue(record.view.queue,'API 重启，需明确恢复待发',true);
        record.view.configurationPending=false;record.view.collaborationAvailable=false;
        record.view.collaboration={...record.view.collaboration,state:'unavailable',reason:'API 已重启；恢复会话后重新确认协作版本'};
        record.queueMutations=Object.assign(Object.create(null),record.queueMutations);
        record.view.sessionApprovalGrantCount = 0;
        record.view.approvalPolicyVersion = APPROVAL_POLICY_VERSION;
        record.view.approvalMode = 'manual';
        delete record.view.approvalModeError;delete record.view.approvalReviewer;
        record.view.version++;record.view.updatedAt = new Date().toISOString();
        record.intents = Object.assign(Object.create(null), record.intents);
        for (const action of Object.values(record.intents)) if (action.pending) { action.pending = false; action.error = 'outcome-unknown: API restarted before control result'; }
        this.records.set(this.key(record.view.workspaceId, dir), record);
        this.persist(record);
      } catch { /* malformed record must never launch a process */ }
    }
  }
  private directory(record: RecordData) { return path.join(this.dataDir, record.view.nodeId); }
  private persist(record: RecordData) {
    const dir = this.directory(record); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, 'record.json');fs.writeFileSync(`${file}.tmp`, JSON.stringify(record), {mode:0o600});fs.renameSync(`${file}.tmp`, file);
  }
  private changed(record: RecordData) {
    record.view.approvalPolicyVersion = APPROVAL_POLICY_VERSION;
    record.view.queue ??= emptyQueue();
    if(record.view.lifecycle!=='ready'&&!record.view.queue.paused)pauseQueue(record.view.queue,'会话不可用，需明确恢复待发');
    if(record.view.snapshot){
      reconcileQueue(record.view.queue,record.view.snapshot);
      record.originBindings ??= Object.create(null);
      associateMessageOrigins(record.view,record.origins??{},record.intentOrigins??{},record.originBindings!);
    }
    record.view.collaborationAvailable=record.view.lifecycle==='ready'&&record.view.collaboration?.state==='ready';
    if(!['ready','starting'].includes(record.view.lifecycle))record.view.collaboration={...record.view.collaboration,state:'unavailable',reason:'会话未就绪；协作能力未启用'};
    if(record.view.lifecycle!=='ready'){this.approvalEngines.get(this.key(record.view.workspaceId,record.view.nodeId))?.reset();record.view.approvalMode='manual';delete record.view.approvalReviewer;}
    record.view.sessionApprovalGrantCount = this.approvalEngines.get(this.key(record.view.workspaceId,record.view.nodeId))?.grantCount??0;
    record.view.version++;record.view.updatedAt = new Date().toISOString();this.persist(record);this.emit('changed', structuredClone(record.view));
    this.collaboration.reconcile(record.view.workspaceId);
    queueMicrotask(() => { this.engine(record).observe();void this.pumpQueue(record); });
  }
  private engine(record:RecordData):ApprovalEngine {
    const key=this.key(record.view.workspaceId,record.view.nodeId);let engine=this.approvalEngines.get(key);
    if(!engine){engine=new ApprovalEngine({
      get:()=>record.view,
      record:entry=>{const history=record.view.approvalAudit??[];record.view.approvalAudit=[...history,entry].slice(-100);this.changed(record);},
      approve:async(input,intent)=>{
        const current=record.view.snapshot&&bindApproval(record.view.snapshot,input.approval.id);
        if(!current||current.digest!==input.digest)throw new Error('approval changed');
        return this.control(record.view.workspaceId,record.view.nodeId,'approval',{intentId:intent,approvalId:input.approval.id,decision:'approved',expectedApprovalDigest:input.digest},true);
      },
    });this.approvalEngines.set(key,engine);}return engine;
  }
  grantExactApproval(wid:string,nid:string,approvalId:string,expectedDigest:string):SessionView {
    const record=this.record(wid,nid);
    const input=record.view.snapshot&&bindApproval(record.view.snapshot,approvalId);
    if(!input||input.digest!==expectedDigest)throw new Error('approval changed; inspect again');
    this.engine(record).grantExact(input);
    this.changed(record);
    return structuredClone(record.view);
  }
  setApprovalMode(wid:string,nid:string,mode:ApprovalMode,reviewer?:ReviewerConfig):SessionView {
    const record=this.record(wid,nid);
    if(!['manual','assisted','full'].includes(mode))throw new Error('invalid approval mode');
    if(mode!=='manual'&&record.view.lifecycle!=='ready')throw new Error('session not ready');
    if(mode==='assisted'&&(!reviewer?.provider||!reviewer?.model))throw new Error('explicit reviewer model required');
    this.engine(record).set(mode,mode==='assisted'?reviewer:undefined);
    record.view.approvalMode=mode;record.view.approvalReviewer=mode==='assisted'?reviewer:undefined;delete record.view.approvalModeError;
    this.changed(record);return structuredClone(record.view);
  }
  rename(wid:string,nid:string,title:string,expectedVersion:number):SessionView {
    const record=this.record(wid,nid);
    if(record.view.version!==expectedVersion)throw new Error('会话版本冲突，请刷新后重试');
    const normalized=title.trim().normalize('NFC');
    if(!normalized||normalized.length>160||[...normalized].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))throw new Error('昵称须为 1–160 字符，不能包含控制字符');
    record.view.title=normalized;this.changed(record);return structuredClone(record.view);
  }
  private applyConfiguration(record:RecordData,value:RuntimeConfiguration) {
    if(value.nativeSessionId!==record.view.ref.nativeSessionId)throw new Error('configuration native identity mismatch');
    const prior=record.view.configuration;
    const same=prior?.model?.provider===value.model?.provider&&prior?.model?.id===value.model?.id&&prior?.thinkingLevel===value.thinkingLevel;
    record.view.configuration={...value,revision:(prior?.revision??0)+(same?0:1)};
    if(value.model){record.view.ref.provider=value.model.provider;record.view.ref.model=value.model.id;}
    delete record.view.configurationError;
  }
  private request(record:RecordData,type:string,body:Record<string,unknown>):Promise<unknown> {
    const running=this.workers.get(this.key(record.view.workspaceId,record.view.nodeId));
    if(!running||running.stopping||record.view.lifecycle!=='ready')return Promise.reject(new Error('session not ready'));
    const id=randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{running.pending.delete(id);reject(new Error('outcome-unknown: runtime request timeout'));},this.options.controlMs??30000);
      running.pending.set(id,{resolve,reject,timer});
      running.child.send({type,id,...body},error=>{if(error){clearTimeout(timer);running.pending.delete(id);reject(error);}});
    });
  }
  async configuration(wid:string,nid:string,change?:ConfigurationChange):Promise<SessionView> {
    const record=this.record(wid,nid), key=this.key(wid,nid), signature=JSON.stringify(['configuration',change]);
    if(this.configurationJobs.has(key)||this.queueJobs.has(key)||[...this.controls.keys()].some(k=>k.startsWith(`${key}/`)))throw new Error('会话操作进行中，配置未修改');
    if(change){
      const prior=record.intents[change.intentId];
      if(prior){if(prior.signature!==signature)throw new Error('intent id reused for different operation');if(prior.error)throw new Error(prior.error);if(prior.pending)throw new Error('outcome-unknown: configuration unresolved');return structuredClone(record.view);}
      if(!record.view.configuration||record.view.configuration.revision!==change.expectedRevision)throw new Error('配置版本冲突，请重新读取');
      if(record.view.snapshot?.status!=='idle'||record.view.snapshot.runs.some(r=>r.state==='running')||record.view.snapshot.pendingActions.some(a=>a.kind!=='model'&&['submitted','dispatched','outcome-unknown'].includes(a.state)))throw new Error('执行或未确认操作期间不可修改配置');
      record.intents[change.intentId]={signature,pending:true};
    }
    this.configurationJobs.add(key);record.view.configurationPending=true;this.changed(record);
    try {
      const result=await this.request(record,'configuration',{change}) as RuntimeConfiguration;
      this.applyConfiguration(record,result);
      if(change)record.intents[change.intentId]={signature,result};
      return structuredClone({...record.view,configurationPending:false});
    } catch(error){
      const message=error instanceof Error?error.message:String(error);record.view.configurationError=message;
      if(change)record.intents[change.intentId]={signature,error:message};throw error;
    } finally {this.configurationJobs.delete(key);record.view.configurationPending=false;this.changed(record);}
  }
  async queue(wid:string,nid:string,input:QueueMutation):Promise<SessionView> {
    const record=this.record(wid,nid),key=this.key(wid,nid);record.view.queue??=emptyQueue();record.queueMutations??=Object.create(null);
    const signature=JSON.stringify(input),prior=record.queueMutations![input.mutationId];
    if(prior){if(prior!==signature)throw new Error('queue mutation id reused');return structuredClone(record.view);}
    if(Object.keys(record.queueMutations!).length>=10000)throw new Error('队列操作记录达到容量限制');
    if(input.operation==='edit'&&record.view.queue.items.find(i=>i.id===input.itemId)?.origin?.kind==='agent')throw new Error('Agent 来源消息不可改写；可移除后以自己的身份重新发送');
    if(['add','edit'].includes(input.operation))validateMessage(input.content??'',input.attachments??[],record.view.configuration?.model?.input.includes('image')??false);
    if(input.operation==='sendNow'){
      if(this.queueJobs.has(key)||this.configurationJobs.has(key))throw new Error('已有会话操作进行中');
      if(record.view.lifecycle!=='ready')throw new Error('session not ready');
      const active=record.view.snapshot?.runs.some(r=>r.state==='running');
      if(active&&input.confirmSteer!==true)throw new Error('当前正在运行，立即发送必须明确确认 Steer');
      if(record.view.queue.items.some(i=>['dispatching','submitted','unknown'].includes(i.state)))throw new Error('前一项尚未确认消费，不能继续派发');
      mutateQueue(record.view.queue,input);record.queueMutations![input.mutationId]=signature;
      const item=record.view.queue.items.find(i=>i.id===input.itemId)!;
      this.queueJobs.add(key);
      try {await this.dispatchQueue(record,item,active?'steer':'nextTurn');}
      finally {this.queueJobs.delete(key);}
    }else {mutateQueue(record.view.queue,input);record.queueMutations![input.mutationId]=signature;this.changed(record);}
    return structuredClone(record.view);
  }
  private async dispatchQueue(record:RecordData,item:QueueItem,deliverAs:'steer'|'nextTurn') {
    item.state='dispatching';item.submittedAt=new Date().toISOString();record.view.queue!.revision++;this.changed(record);
    try {
      const action=await this.control(record.view.workspaceId,record.view.nodeId,'messages',{intentId:item.intentId,content:item.content,attachments:item.attachments,deliverAs}) as {id?:string;state?:string;reason?:string};
      if(item.state==='dispatching')item.state=action.state==='applied'?'consumed':action.state==='rejected'?'rejected':action.state==='outcome-unknown'?'unknown':'submitted';
      item.actionId=action.id;
      if(['unknown','rejected'].includes(item.state)){item.error=action.reason??'派发未确认';pauseQueue(record.view.queue!,item.error);}
    }catch(error){item.state='unknown';item.error=error instanceof Error?error.message:String(error);pauseQueue(record.view.queue!,'派发结果未知，不会重发');}
    record.view.queue!.revision++;this.changed(record);
  }
  private async pumpQueue(record:RecordData) {
    const key=this.key(record.view.workspaceId,record.view.nodeId),queue=record.view.queue;
    if(this.closing||!queue||this.queueJobs.has(key)||this.configurationJobs.has(key)||record.view.configurationError||record.view.lifecycle!=='ready'||!queueReady(queue,record.view.snapshot))return;
    const item=queue.items.find(i=>i.state==='pending');if(!item)return;
    this.queueJobs.add(key);
    try {await this.dispatchQueue(record,item,'nextTurn');}
    finally {this.queueJobs.delete(key);}
  }
  list(wid: string): SessionView[] { this.load();return [...this.records.values()].filter(r=>r.view.workspaceId===wid).map(r=>structuredClone(r.view)); }
  get(wid: string, nid: string): SessionView | undefined { this.load();const r=this.records.get(this.key(wid,nid));return r?structuredClone(r.view):undefined; }
  private record(wid: string, nid: string) { this.load();const r=this.records.get(this.key(wid,nid));if(!r)throw new Error('session not found');return r; }
  async create(input: { workspaceId:string;nodeId:string;title:string;cwd:string;provider?:string;model?:string }): Promise<SessionView> {
    this.load(); if(this.closing)throw new Error('manager is closing');
    if(!/^n-[a-zA-Z0-9-]+$/.test(input.nodeId))throw new Error('invalid node id');
    const key=this.key(input.workspaceId,input.nodeId);if(this.records.has(key))throw new Error('session already exists');
    const record:RecordData={started:false,intents:Object.create(null),view:{workspaceId:input.workspaceId,nodeId:input.nodeId,title:input.title,lifecycle:'starting',version:0,updatedAt:new Date().toISOString(),ref:{agentSessionId:'',nativeSessionId:randomUUID(),cwd:input.cwd,...(input.provider?{provider:input.provider}:{}),...(input.model?{model:input.model}:{})}}};
    this.records.set(key,record);this.changed(record);
    return this.launch(record,false);
  }
  /** Agent-initiated card creation: registers the record synchronously, launches the worker in the background. */
  spawn(input: { workspaceId:string;parent:string;spawnId:string;title:string;task:string;depth:number;origin:MessageOrigin }): SessionView {
    this.load(); if(this.closing)throw new Error('manager is closing');
    const cwd=this.record(input.workspaceId,input.parent).view.ref.cwd;
    const nodeId=`n-${randomUUID()}`,key=this.key(input.workspaceId,nodeId);
    const record:RecordData={started:false,intents:Object.create(null),spawnTask:{content:input.task,spawnId:input.spawnId,origin:input.origin},
      view:{workspaceId:input.workspaceId,nodeId,title:input.title,lifecycle:'starting',version:0,updatedAt:new Date().toISOString(),ref:{agentSessionId:'',nativeSessionId:randomUUID(),cwd}}};
    this.records.set(key,record);
    // Position and lineage are applied by the canvas layer before applySession sees this view.
    this.emit('spawned',{workspaceId:input.workspaceId,parent:input.parent,nodeId,spawnId:input.spawnId,depth:input.depth,view:structuredClone(record.view)});
    this.changed(record);
    queueMicrotask(()=>{void this.launch(record,false).catch(()=>{/* lifecycle/error already recorded */});});
    return structuredClone(record.view);
  }
  private async launch(record: RecordData, resume: boolean): Promise<SessionView> {
    const key=this.key(record.view.workspaceId,record.view.nodeId);
    // Reject before entering cleanup: another launch owns this live process.
    if(this.closing)throw new Error('manager is closing');
    if(this.workers.has(key)||this.launching.has(key))throw new Error('session is already starting/running');
    this.launching.add(key);this.cancelled.delete(key);
    try {
      if(new Set([...this.workers.keys(),...this.launching]).size > (this.options.maxSessions??MAX_SESSIONS))throw new Error('live session limit reached');
      const cfg=this.options.skipPreflight?{adeRoot:'fixture',piBin:'fixture',cwd:record.view.ref.cwd}:runtimeConfig();
      if(!this.options.skipPreflight){
        if(fs.realpathSync(record.view.ref.cwd)!==cfg.cwd)throw new Error('session cwd differs from configured project');
        const status=await runtimeStatus();if(!status.available)throw new Error(status.reason||'runtime unavailable');
      }
      // Recheck after async preflight to avoid concurrency overcommit.
      if(this.closing||this.cancelled.has(key))throw new Error('session startup cancelled');
      this.engine(record).reset();record.view.approvalMode='manual';delete record.view.approvalReviewer;
      let collaboration: CollaborationManifest | undefined;
      try { collaboration=readCollaborationPackage().manifest;record.view.collaboration={state:'checking',expected:collaboration,reason:'等待当前运行器确认 Skill 与工具版本'}; }
      catch(error){record.view.collaboration={state:'incompatible',reason:error instanceof Error?error.message:'协作资源不可用'};}
      record.view.lifecycle='starting';delete record.view.error;this.changed(record);
      const logfd=fs.openSync(path.join(this.directory(record),'worker.log'),'a',0o600);
      const child=fork(this.options.workerPath??path.join(APP_ROOT,'scripts/e-runtime-worker.mts'),[],{cwd:APP_ROOT,execArgv:['--import','tsx'],stdio:['ignore',logfd,logfd,'ipc'],env:{...process.env}});fs.closeSync(logfd);
      let resolveClosed!:()=>void;
      const running:Running={child,stopping:false,pending:new Map(),closed:new Promise(resolve=>{resolveClosed=resolve;})};this.workers.set(key,running);
      child.on('error',error=>{running.readyReject?.(error);});
      child.on('close',()=>{
        if(this.workers.get(key)===running)this.workers.delete(key);
        const error=new Error('runtime worker exited');running.readyReject?.(error);
        for(const waiter of running.pending.values()){clearTimeout(waiter.timer);waiter.reject(error);}running.pending.clear();
        if(!running.stopping && record.view.lifecycle!=='failed'){record.view.lifecycle='interrupted';record.view.error='runtime worker exited';this.changed(record);}
        resolveClosed();
      });
      const ready=new Promise<SessionView>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('runtime startup timeout')),this.options.startupMs??120000);
        running.readyReject=e=>{clearTimeout(timer);reject(e);};
        child.on('message',(value:unknown)=>{
          if(this.workers.get(key)!==running||!value||typeof value!=='object')return;
          const msg=value as WorkerMessage;
          const applyCollaboration=(status:CollaborationStatus)=>{
            const ready=status.state==='ready'&&!!collaboration&&validateCollaborationHello(collaboration,{type:'hello',manifest:status.loaded,skillDiscovered:status.skillDiscovered,activeTools:status.activeTools,instructionMode:status.instructionMode});
            record.view.collaboration=ready?{...status,expected:collaboration}:{...status,expected:collaboration,state:status.state==='ready'?'incompatible':status.state,reason:status.state==='ready'?'运行器协作握手与 API 版本不一致':status.reason};
            record.view.collaborationAvailable=record.view.lifecycle==='ready'&&ready;
          };
          if(msg.type==='collaboration-status'&&msg.collaboration&&!running.stopping){applyCollaboration(msg.collaboration);this.changed(record);return;}
          if(msg.type==='collaboration'&&msg.id&&msg.request){
            const request=msg.request,id=msg.id;
            void (async()=>{
              // Snapshot notifications may trail the private tool request by a few milliseconds.
              const deadline=Date.now()+4000;
              for(;;){
                if(this.workers.get(key)!==running||running.stopping||record.view.lifecycle!=='ready')throw new CollaborationError('NOT_READY','stale collaboration worker');
                try { const tool=authorizeCollaboration(record.view,request);return validateCollaborationResult(request.tool,this.collaboration.execute(record.view,request,tool)); }
                catch(error){if(!(error instanceof CollaborationError)||error.code!=='EVIDENCE_PENDING'||Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,40));}
              }
            })().then(result=>{if(child.connected)child.send({type:'collaboration-result',response:{protocolVersion:COLLABORATION_PROTOCOL_VERSION,id,ok:true,result}});},error=>{if(child.connected)child.send({type:'collaboration-result',response:{protocolVersion:COLLABORATION_PROTOCOL_VERSION,id,ok:false,error:collaborationError(error)}});});return;
          }
          if(msg.type==='fatal'){record.view.error=msg.error||'runtime failed';running.readyReject?.(new Error(record.view.error));if(record.view.lifecycle==='ready'){record.view.lifecycle='failed';this.changed(record);}return;}
          if(msg.type==='degraded'){record.view.error=msg.error;record.view.lifecycle='interrupted';this.changed(record);return;}
          if((msg.type==='ready'||msg.type==='snapshot')&&msg.snapshot&&msg.ref){
            if(msg.ref.nativeSessionId!==record.view.ref.nativeSessionId||msg.snapshot.id!==msg.ref.agentSessionId||msg.snapshot.nativeSessionId!==msg.ref.nativeSessionId)return;
            record.view.ref=msg.ref;record.view.snapshot=msg.snapshot;
            if(msg.origins)record.origins={...record.origins,...msg.origins};
            if(msg.configuration)this.applyConfiguration(record,msg.configuration);
            if(!running.stopping){record.view.lifecycle = msg.snapshot.status === 'degraded' ? 'interrupted' : 'ready';delete record.view.error;}
            record.started=true;this.changed(record);
            if(msg.type==='ready'){if(msg.collaboration)applyCollaboration(msg.collaboration);else if(record.view.collaboration?.state==='checking')record.view.collaboration={...record.view.collaboration,state:'unavailable',reason:'运行器未确认协作包；需要更新并恢复会话'};this.changed(record);clearTimeout(timer);running.readyReject=undefined;resolve(structuredClone(record.view));
              const task=record.spawnTask;if(task){delete record.spawnTask;record.intentOrigins??=Object.create(null);record.intentOrigins![task.spawnId]=task.origin;this.persist(record);
                void this.control(record.view.workspaceId,record.view.nodeId,'messages',{intentId:task.spawnId,content:task.content,deliverAs:'nextTurn'}).catch(error=>{record.view.error=error instanceof Error?error.message:String(error);this.changed(record);});}
            }
          }
          if(msg.type==='configuration'&&msg.configuration){this.applyConfiguration(record,msg.configuration);this.changed(record);}
          if(msg.type==='response'&&msg.id){const waiter=running.pending.get(msg.id);if(waiter){clearTimeout(waiter.timer);running.pending.delete(msg.id);if(msg.error)waiter.reject(new Error(msg.error));else waiter.resolve(msg.result);}}
        });
      });
      child.send({type:'init',config:{...cfg,cwd:record.view.ref.cwd,dir:this.directory(record),nativeSessionId:record.view.ref.nativeSessionId,provider:record.view.ref.provider,model:record.view.ref.model,thinkingLevel:record.view.configuration?.thinkingLevel,collaboration,resume}});
      return await ready;
    } catch(error) {
      const running=this.workers.get(key);if(running){running.stopping=true;running.child.kill('SIGTERM');await this.waitExit(running);}
      record.view.lifecycle=this.cancelled.has(key)||this.closing?'stopped':'failed';record.view.error=error instanceof Error?error.message:String(error);this.changed(record);throw error;
    } finally { this.launching.delete(key);this.cancelled.delete(key); }
  }
  private async waitExit(running:Running) {
    const timer=setTimeout(()=>running.child.kill('SIGKILL'),10000);
    await running.closed;clearTimeout(timer);
  }
  async stop(wid:string,nid:string):Promise<SessionView>{
    const record=this.record(wid,nid),key=this.key(wid,nid),running=this.workers.get(key);
    this.cancelled.add(key);
    record.view.queue??=emptyQueue();pauseQueue(record.view.queue,'会话停止或归档，需明确恢复待发',true);this.changed(record);
    this.engine(record).reset();record.view.approvalMode = 'manual';delete record.view.approvalReviewer;
    if(running){running.stopping=true;if(running.child.connected)running.child.send({type:'stop'});else running.child.kill('SIGTERM');await this.waitExit(running);}
    record.view.lifecycle='stopped';delete record.view.error;this.changed(record);return structuredClone(record.view);
  }
  async resume(wid:string,nid:string):Promise<SessionView>{const record=this.record(wid,nid);return this.launch(record,record.started);}
  async control(wid:string,nid:string,operation:ControlOperation,payload:ControlPayload,policy=false):Promise<unknown>{
    const record=this.record(wid,nid),key=this.key(wid,nid),jobKey=`${key}/${payload.intentId}`,signature=JSON.stringify([operation,payload]);
    if(operation==='approval'&&!policy&&payload.approvalId)this.engine(record).manual(payload.approvalId);
    const prior=Object.hasOwn(record.intents,payload.intentId)?record.intents[payload.intentId]:undefined;
    if(prior && prior.signature!==signature)throw new Error('intent id reused for different operation');
    if(this.controls.has(jobKey))return this.controls.get(jobKey)!;
    if(prior){if(prior.signature!==signature)throw new Error('intent id reused for different operation');if(prior.error)throw new Error(prior.error);if(prior.pending)throw new Error('outcome-unknown: prior request unresolved');return prior.result;}
    if(operation==='messages'){
      if(this.configurationJobs.has(key)||record.view.configurationError)throw new Error('配置正在修改或尚未确认，请重新读取配置');
      validateMessage(payload.content??'',payload.attachments??[],record.view.configuration?.model?.input.includes('image')??false);
    }
    const running=this.workers.get(key);if(!running||running.stopping||record.view.lifecycle!=='ready')throw new Error('session not ready');
    if(Object.keys(record.intents).length>10000)throw new Error('session intent limit reached');
    record.intents[payload.intentId]={signature,pending:true};this.persist(record);
    const id=randomUUID();
    const job=new Promise<unknown>((resolve,reject)=>{
      const timer=setTimeout(()=>{running.pending.delete(id);reject(new Error('outcome-unknown: control timeout; not automatically retried'));},this.options.controlMs??30000);
      running.pending.set(id,{resolve,reject,timer});
      running.child.send({type:'control',id,operation,payload},error=>{if(error){clearTimeout(timer);running.pending.delete(id);reject(error);}});
    }).then(result=>{record.intents[payload.intentId]={signature,result};this.persist(record);return result;},error=>{record.intents[payload.intentId]={signature,error:error.message};this.persist(record);throw error;}).finally(()=>this.controls.delete(jobKey));
    this.controls.set(jobKey,job);return job;
  }
  async close():Promise<void>{this.closing=true;for(const key of this.launching)this.cancelled.add(key);await Promise.all([...this.workers.keys()].map(key=>{const [wid,nid]=key.split('/');return this.stop(wid,nid);}));}
}
export const eSessions = new SessionManager();

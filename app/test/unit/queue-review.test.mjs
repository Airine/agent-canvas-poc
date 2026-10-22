import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mutateQueue,pauseQueue,reconcileQueue,queueReady} from '../../api/e/message-queue.ts';
import {SessionManager} from '../../api/e/session-manager.ts';
import {sessionIndicator,sessionNotices} from '../../src/pages/canvas/chat/presentation-state.ts';

const unknown=()=>({id:'old',intentId:'queue:old',actionId:'action:old',content:'original',attachments:[],createdAt:'2026-01-01',submittedAt:'2026-01-01',state:'unknown',error:'adapter control timeout; outcome unknown',origin:{kind:'agent',label:'Peer',channel:'canvas',authenticated:true}});
const queue=()=>({revision:3,paused:true,reason:'restart',items:[unknown(),{id:'next',intentId:'queue:next',content:'next',attachments:[],createdAt:'2026-01-01',state:'pending'}]});
const snapshot=()=>({id:'as:n',nativeSessionId:'native:n',epoch:'e',revision:1,seq:1,nextSeq:2,status:'idle',runs:[],tools:[],messages:[],approvals:[],pendingActions:[],degradedReasons:[],capabilities:[{name:'send.user-message',available:true,authority:'authoritative'}]});
const review=q=>({mutationId:'review-once',expectedRevision:q.revision,operation:'reviewUnknown',itemId:'old',confirmReview:true,reviewNote:'Checked history and tools; leave delivery unknown and stop tracking.'});
const action=()=>({id:'action:old',kind:'send',state:'outcome-unknown',idempotencyKey:'queue:old'});

test('manual review preserves original evidence, adds audit, and never consumes, requeues or resumes',()=>{
 const q=queue(),original=structuredClone(q.items[0]),request=review(q);
 mutateQueue(q,request);
 const item=q.items[0];assert.equal(item.state,'dismissed');assert.equal(q.paused,true);
 assert.equal(item.consumedAt,undefined);assert.equal(q.items[1].state,'pending');
 const {state:oldState,...evidence}=original;const {state,review:audit,...after}=item;
 assert.deepEqual(after,evidence);assert.equal(oldState,'unknown');assert.equal(state,'dismissed');
 assert.deepEqual({...audit,at:undefined},{mutationId:request.mutationId,actor:'user',decision:'stop-tracking',priorState:'unknown',note:request.reviewNote,at:undefined});
 assert.ok(Number.isFinite(Date.parse(audit.at)));assert.equal(queueReady(q,snapshot()),false);
 for(const operation of ['delete','edit','sendNow'])assert.throws(()=>mutateQueue(q,{...request,operation,expectedRevision:q.revision}),/尚未/);
 for(const outcome of ['applied','rejected','outcome-unknown']){
  const s=snapshot();s.pendingActions=[{...action(),state:outcome}];
  assert.equal(reconcileQueue(q,s),false);assert.equal(item.state,'dismissed');assert.equal(item.error,original.error);
 }
 pauseQueue(q,'restart',true);assert.deepEqual(item.review,audit);
});

test('review requires CAS, an unknown item, explicit confirmation and a bounded note; failures are atomic',()=>{
 for(const patch of [{expectedRevision:0},{confirmReview:false},{reviewNote:''},{reviewNote:'   '},{reviewNote:'x'.repeat(1001)},{itemId:'next'},{itemId:'missing'}]){
  const q=queue(),before=structuredClone(q);assert.throws(()=>mutateQueue(q,{...review(q),...patch}));assert.deepEqual(q,before);
 }
 const q=queue();mutateQueue(q,review(q));const before=structuredClone(q);
 assert.throws(()=>mutateQueue(q,{...review(q),mutationId:'second'}),/尚未处理/);assert.deepEqual(q,before);
});

test('explicit resume waives only the reviewed unknown action, never live or unrelated work',()=>{
 const q=queue(),s=snapshot();s.pendingActions=[action()];
 assert.throws(()=>mutateQueue(q,{operation:'resume',authorize:true,expectedRevision:q.revision}),/未知/);
 mutateQueue(q,review(q));assert.equal(queueReady(q,s),false);
 mutateQueue(q,{operation:'resume',authorize:true,expectedRevision:q.revision});assert.equal(queueReady(q,s),true);
 assert.equal(s.pendingActions[0].state,'outcome-unknown','canonical runtime evidence is untouched');
 for(const patch of [{state:'submitted'},{state:'dispatched'},{id:'different'},{idempotencyKey:'queue:other'}]){
  s.pendingActions=[{...action(),...patch}];assert.equal(queueReady(q,s),false,JSON.stringify(patch));
 }
 s.pendingActions=[action(),{...action(),id:'other',idempotencyKey:'queue:other'}];assert.equal(queueReady(q,s),false);
 s.pendingActions=[];q.items.push({...unknown(),id:'another',intentId:'queue:another'});assert.equal(queueReady(q,s),false);
});

test('session lifecycle and queue warnings remain separate before and after manual review',()=>{
 const s={lifecycle:'ready',ref:{nativeSessionId:'native:n'},snapshot:snapshot(),queue:queue()};
 let indicator=sessionIndicator(s,true);assert.equal(indicator.label,'会话已就绪');assert.match(indicator.queueLabel,/队列待核实/);assert.equal(indicator.usage,undefined);
 for(const [lifecycle,label] of [['stopped','会话已停止'],['failed','会话故障'],['starting','正在启动']]){
  const i=sessionIndicator({...s,lifecycle},true);assert.equal(i.label,label);assert.match(i.queueLabel,/待核实/);
 }
 assert.equal(sessionIndicator(s,false).label,'连接中断');
 s.snapshot.pendingActions=[action()];mutateQueue(s.queue,review(s.queue));indicator=sessionIndicator(s,true);
 assert.equal(indicator.label,'会话已就绪');assert.equal(indicator.queueLabel,'队列已暂停');assert.equal(indicator.state.warning,undefined);
 assert.equal(sessionNotices(s,true).some(n=>n.id==='actions'),false);
 s.snapshot.pendingActions.push({...action(),id:'other',idempotencyKey:'queue:other'});
 assert.match(sessionIndicator(s,true).state.warning,/1 个操作/);assert.equal(sessionNotices(s,true).some(n=>n.id==='actions'),true);
});

test('review audit and idempotency survive manager reload without touching history or dispatching',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-review-')),nid='n-review',recordDir=path.join(dir,nid);fs.mkdirSync(recordDir);
 const view={workspaceId:'w',nodeId:nid,title:'Fixture',lifecycle:'stopped',version:1,updatedAt:'2026-01-01',ref:{agentSessionId:'as:n',nativeSessionId:'native:n',cwd:process.cwd()},snapshot:snapshot(),queue:queue()};
 fs.writeFileSync(path.join(recordDir,'record.json'),JSON.stringify({started:true,intents:{},view}));
 const m=new SessionManager({dataDir:dir,skipPreflight:true,workerPath:fileURLToPath(new URL('./fixtures/session-worker.mjs',import.meta.url))});
 t.after(async()=>{await m.close();fs.rmSync(dir,{recursive:true,force:true});});
 const calls=t.mock.method(m,'control',async()=>{throw Error('unexpected dispatch');});
 const current=m.get('w',nid);assert.equal(current.queueReviewVersion,1);const request=review(current.queue);
 const result=await m.queue('w',nid,request);assert.equal(result.queue.paused,true);
 const audit=structuredClone(result.queue.items[0].review);
 assert.deepEqual((await m.queue('w',nid,request)).queue,result.queue);
 await assert.rejects(m.queue('w',nid,{...request,reviewNote:'different'}),/reused/);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.mock.calls.length,0);
 await m.close();
 const reloaded=new SessionManager({dataDir:dir,skipPreflight:true});t.after(()=>reloaded.close());
 const restored=reloaded.get('w',nid);assert.deepEqual(restored.ref,view.ref);assert.deepEqual(restored.snapshot,view.snapshot);
 assert.equal(restored.queue.items[0].state,'dismissed');assert.deepEqual(restored.queue.items[0].review,audit);
 assert.deepEqual((await reloaded.queue('w',nid,request)).queue.items[0].review,audit);
 assert.equal(restored.queue.items[1].state,'pending');assert.equal(restored.queue.paused,true);
});

test('manager refuses review while a matching action is dispatched',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-review-live-'));fs.mkdirSync(path.join(dir,'n-live'));
 const s=snapshot();s.pendingActions=[{...action(),state:'dispatched'}];
 fs.writeFileSync(path.join(dir,'n-live','record.json'),JSON.stringify({started:true,intents:{},view:{workspaceId:'w',nodeId:'n-live',title:'Live',lifecycle:'stopped',version:1,ref:{nativeSessionId:'native:n'},snapshot:s,queue:queue()}}));
 const m=new SessionManager({dataDir:dir,skipPreflight:true});t.after(async()=>{await m.close();fs.rmSync(dir,{recursive:true,force:true});});
 const before=m.get('w','n-live');await assert.rejects(m.queue('w','n-live',review(before.queue)),/进行中/);
 assert.deepEqual(m.get('w','n-live').queue,before.queue);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {SessionManager} from '../../api/e/session-manager.ts';
const workerPath=fileURLToPath(new URL('./fixtures/session-worker.mjs',import.meta.url));
function setup(t,options={}){const dir=fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR||os.tmpdir(),'lifecycle-'));const m=new SessionManager({dataDir:dir,workerPath,skipPreflight:true,startupMs:2000,controlMs:200,...options});t.after(async()=>{await m.close();fs.rmSync(dir,{force:true,recursive:true});});return {m,dir};}
const input=(nodeId='n-one')=>({workspaceId:'w',nodeId,title:'Fixture',cwd:process.cwd()});
test('create/stop/reload/resume preserves identity and monotonic version',async t=>{const {m,dir}=setup(t);const a=await m.create(input());assert.equal(a.lifecycle,'ready');await assert.rejects(m.resume('w','n-one'),/already/);assert.equal(m.get('w','n-one').lifecycle,'ready');assert.equal(m.get('other','n-one'),undefined);await m.stop('w','n-one');const m2=new SessionManager({dataDir:dir,workerPath,skipPreflight:true});t.after(()=>m2.close());const before=m2.get('w','n-one');assert.equal(before.lifecycle,'stopped');const b=await m2.resume('w','n-one');assert.equal(b.ref.nativeSessionId,a.ref.nativeSessionId);assert.ok(b.version>before.version);});
test('intent id deduplicates in-flight and persisted controls; conflicts rejected',async t=>{const {m}=setup(t);await m.create(input());const payload={intentId:'same',content:'hello'};const a=m.control('w','n-one','messages',payload);await assert.rejects(m.control('w','n-one','messages',{...payload,content:'changed'}),/reused/);assert.deepEqual(await a,await m.control('w','n-one','messages',payload));assert.deepEqual(await m.control('w','n-one','messages',payload),{id:'same',state:'dispatched'});});
test('timeouts and crashes are surfaced, not silently retried',async t=>{const {m}=setup(t);await m.create(input());await assert.rejects(m.control('w','n-one','messages',{intentId:'hung',content:'hang'}),/outcome-unknown/);await assert.rejects(m.control('w','n-one','messages',{intentId:'hung',content:'hang'}),/outcome-unknown/);await assert.rejects(m.control('w','n-one','messages',{intentId:'crash',content:'crash'}),/exited/);assert.equal(m.get('w','n-one').lifecycle,'interrupted');});
test('startup failure/timeout and concurrency limits cleanly fail',async t=>{const {m}=setup(t,{maxSessions:1,startupMs:500});await assert.rejects(m.create(input('n-fail-start')),/fixture start failure/);await assert.rejects(m.create(input('n-hang-start')),/timeout/);await m.create(input());await assert.rejects(m.create(input('n-two')),/limit/);assert.equal(m.get('w','n-one').lifecycle,'ready');});

test('Full Access and assisted authority never survive stop or manager reload',async t=>{const {m,dir}=setup(t);await m.create(input());m.setApprovalMode('w','n-one','full');assert.equal(m.get('w','n-one').approvalMode,'full');await m.stop('w','n-one');assert.equal(m.get('w','n-one').approvalMode,'manual');await m.resume('w','n-one');assert.equal(m.get('w','n-one').approvalMode,'manual');m.setApprovalMode('w','n-one','assisted',{provider:'fixture',model:'fixture'});assert.equal(m.get('w','n-one').approvalMode,'assisted');await m.close();const second=new SessionManager({dataDir:dir,workerPath,skipPreflight:true});t.after(()=>second.close());assert.equal(second.get('w','n-one').approvalMode,'manual');assert.equal(second.get('w','n-one').approvalReviewer,undefined);});

test('approval policy version is stamped by the running API, not restored as persisted authority',async t=>{
 const {m,dir}=setup(t);const created=await m.create(input());assert.equal(created.approvalPolicyVersion,2);assert.equal(created.sessionLifecycleVersion,2);await m.close();
 const file=path.join(dir,'n-one','record.json'),record=JSON.parse(fs.readFileSync(file,'utf8'));record.view.approvalPolicyVersion=999;record.view.approvalMode='assisted';fs.writeFileSync(file,JSON.stringify(record));
 const next=new SessionManager({dataDir:dir,workerPath,skipPreflight:true});t.after(()=>next.close());const loaded=next.get('w','n-one');assert.equal(loaded.approvalPolicyVersion,2);assert.equal(loaded.sessionLifecycleVersion,2);assert.equal(loaded.approvalMode,'manual');
});

test('archive frees live slot, resume preserves identity, delete requires archive and removes durable record',async t=>{
 const {m,dir}=setup(t,{maxSessions:1});const first=await m.create(input('n-one'));await assert.rejects(m.create(input('n-two')),/limit/);
 await m.archive('w','n-two');m.deleteArchived('w','n-two');assert.equal(m.get('w','n-two'),undefined);
 assert.throws(()=>m.deleteArchived('w','n-one'),/先归档/);
 const archived=await m.archive('w','n-one');assert.ok(archived.archivedAt);assert.equal(archived.lifecycle,'stopped');assert.equal(archived.queue.paused,true);assert.equal(archived.approvalMode,'manual');
 const second=await m.create(input('n-two'));assert.equal(second.lifecycle,'ready');await m.stop('w','n-two');
 const resumed=await m.resume('w','n-one');assert.equal(resumed.lifecycle,'ready');assert.equal(resumed.archivedAt,undefined);assert.equal(resumed.ref.nativeSessionId,first.ref.nativeSessionId);
 await m.archive('w','n-one');m.deleteArchived('w','n-one');assert.equal(m.get('w','n-one'),undefined);assert.equal(fs.existsSync(path.join(dir,'n-one')),false);
 const reloaded=new SessionManager({dataDir:dir,workerPath,skipPreflight:true});t.after(()=>reloaded.close());assert.equal(reloaded.get('w','n-one'),undefined);
});
test('archiving a failed session preserves the failure reason without keeping a worker',async t=>{
 const {m,dir}=setup(t,{startupMs:500});await assert.rejects(m.create(input('n-fail-start')),/fixture start failure/);const failed=m.get('w','n-fail-start');assert.equal(failed.lifecycle,'failed');
 const archived=await m.archive('w','n-fail-start');assert.ok(archived.archivedAt);assert.equal(archived.lifecycle,'failed');assert.equal(archived.error,'fixture start failure');
 const reloaded=new SessionManager({dataDir:dir,workerPath,skipPreflight:true});t.after(()=>reloaded.close());const loaded=reloaded.get('w','n-fail-start');assert.equal(loaded.archivedAt,archived.archivedAt);assert.equal(loaded.error,'fixture start failure');
});

test('failed filesystem deletion retains archived record for inspection and retry',async t=>{
 const {m,dir}=setup(t);await m.create(input());await m.archive('w','n-one');
 const remove=fs.rmSync;
 const mock=t.mock.method(fs,'rmSync',(target,options)=>{
  if(target===path.join(dir,'n-one'))throw new Error('EACCES: fixture deletion denied');
  return remove(target,options);
 });
 assert.throws(()=>m.deleteArchived('w','n-one'),/EACCES/);
 assert.ok(m.get('w','n-one').archivedAt);
 assert.ok(fs.existsSync(path.join(dir,'n-one','record.json')));
 mock.mock.restore();
 m.deleteArchived('w','n-one');
 assert.equal(m.get('w','n-one'),undefined);
 assert.equal(fs.existsSync(path.join(dir,'n-one')),false);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {validateMessage,messageBlocks,attachmentText} from '../../api/e/attachments.ts';
import {emptyQueue,mutateQueue,pauseQueue,reconcileQueue,queueReady} from '../../api/e/message-queue.ts';
const text=(s='hello')=>({id:'t',name:'note.txt',mimeType:'text/plain',data:Buffer.from(s).toString('base64')});
const png=()=>({id:'p',name:'tiny.png',mimeType:'image/png',data:Buffer.from([137,80,78,71,13,10,26,10,...Array(16).fill(0)]).toString('base64')});
test('attachments validate UTF-8, MIME/signature, exact preview blocks, no URI/path previews',()=>{
 const a=text('中文\n<svg onload="x">');assert.equal(attachmentText(a),'中文\n<svg onload="x">');assert.deepEqual(messageBlocks('hello',[a]),'hello\n附件 · note.txt\n中文\n<svg onload="x">');
 for(const attachment of [{...a,data:'/w=='},{...a,name:'x.html'},{...a,name:'../../api/x.txt'},{...a,uri:'file:///etc/passwd'},{...png(),mimeType:'image/jpeg'},{...a,mimeType:'image/svg+xml'},{...a,data:'!!!!'}])assert.throws(()=>validateMessage('',[attachment]));
 assert.throws(()=>validateMessage('',[png()],false),/图像/);assert.equal(validateMessage('',[png()],true).attachments.length,1);
});
test('attachment exact limits reject without truncation',()=>{
 assert.equal(attachmentText(validateMessage('',[text('a'.repeat(102400))]).attachments[0]).length,102400);
 assert.throws(()=>validateMessage('',[text('a'.repeat(102401))]),/100 KiB/);
 assert.throws(()=>validateMessage('',[text('a'.repeat(60000)),{...text('b'.repeat(60000)),id:'b'}]),/100 KiB/);
 assert.throws(()=>validateMessage('',Array.from({length:5},(_,i)=>({...text(),id:String(i)}))),/4 个/);
 const p=png(),bytes=Buffer.alloc(2*1024*1024+1);Buffer.from(p.data,'base64').copy(bytes);assert.throws(()=>validateMessage('',[{...p,data:bytes.toString('base64')}],true),/2 MiB/);
 assert.throws(()=>validateMessage('',[]),/不能为空/);
});
const idle=()=>({status:'idle',runs:[],pendingActions:[],approvals:[],capabilities:[{name:'send.user-message',available:true,authority:'authoritative'}]});
function add(q,id,extra={}){mutateQueue(q,{mutationId:id,expectedRevision:q.revision,operation:'add',itemId:id,content:id,...extra});}
test('queue CAS, pending-only edits, reorder, explicit authorization and dispatch config semantics',()=>{
 const q=emptyQueue();add(q,'one');add(q,'two');assert.equal(queueReady(q,idle()),false);
 assert.throws(()=>mutateQueue(q,{expectedRevision:0,operation:'delete',itemId:'one'}),/冲突/);
 mutateQueue(q,{expectedRevision:q.revision,operation:'move',itemId:'two',direction:'up'});assert.equal(q.items[0].id,'two');
 mutateQueue(q,{expectedRevision:q.revision,operation:'edit',itemId:'two',content:'edited'});assert.equal(q.items[0].content,'edited');
 assert.throws(()=>mutateQueue(q,{expectedRevision:q.revision,operation:'resume'}),/授权/);
 mutateQueue(q,{expectedRevision:q.revision,operation:'resume',authorize:true});assert.equal(queueReady(q,idle()),true);
 q.items[0].state='submitted';assert.equal(queueReady(q,idle()),false);
 for(const operation of ['edit','delete','move','sendNow'])assert.throws(()=>mutateQueue(q,{expectedRevision:q.revision,operation,itemId:'two'}),/尚未/);
 assert.equal('model' in q.items[0],false);
});
test('queue waits for applied evidence then idle; restart and unknown freeze without replay',()=>{
 const q=emptyQueue();add(q,'one',{authorize:true});add(q,'two');q.items[0].state='submitted';
 const s=idle();s.pendingActions=[{id:'a',kind:'send',idempotencyKey:q.items[0].intentId,state:'dispatched'}];reconcileQueue(q,s);assert.equal(queueReady(q,s),false);
 s.pendingActions[0].state='applied';s.runs=[{state:'running'}];reconcileQueue(q,s);assert.equal(q.items[0].state,'consumed');assert.equal(queueReady(q,s),false);
 s.runs=[];assert.equal(queueReady(q,s),true);q.items[1].state='dispatching';pauseQueue(q,'restart',true);assert.equal(q.items[1].state,'unknown');assert.equal(q.paused,true);
 assert.throws(()=>mutateQueue(q,{expectedRevision:q.revision,operation:'resume',authorize:true}),/未知/);
 s.pendingActions.push({id:'b',kind:'send',idempotencyKey:q.items[1].intentId,state:'applied'});reconcileQueue(q,s);assert.equal(q.items[1].state,'consumed');assert.equal(q.paused,true);
});

test('queue holds before dispatch if capability expired or unavailable',()=>{const q=emptyQueue();add(q,'one',{authorize:true});const s=idle();s.capabilities[0].expiresAt='2000-01-01';assert.equal(queueReady(q,s),false);delete s.capabilities[0].expiresAt;s.capabilities[0].available=false;assert.equal(queueReady(q,s),false);s.capabilities=[];assert.equal(queueReady(q,s),false);});

test('aggregate request byte limit is checked before decoding any attachment',()=>{const items=Array.from({length:4},(_,i)=>({id:String(i),name:'large.png',mimeType:'image/png',data:'A'.repeat(3*1024*1024)}));assert.throws(()=>validateMessage('request',items),/12 MiB/);});

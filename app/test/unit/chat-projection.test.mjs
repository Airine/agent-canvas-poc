import test from 'node:test';import assert from 'node:assert/strict';
import {TranscriptProjector} from '../../src/pages/canvas/chat/project-transcript.ts';
const snap=(messages=[],tools=[],approvals=[])=>({messages,tools,approvals,runs:[],turns:[]});
const msg=(id,blocks,extra={})=>({id,role:'assistant',order:0,createdAt:'2026-01-01',state:'completed',blocks,...extra});
test('tool call/result/approval forms one activity with true linkage',()=>{
 const m=msg('a',[{type:'text',text:'before'},{type:'tool-call',toolCallId:'t',name:'bash',arguments:{command:'pwd'}},{type:'text',text:'after'}],{runId:'r',turnId:'turn'});
 const result=msg('result',[{type:'tool-result',toolCallId:'t',content:'ok'}],{role:'tool',toolCallId:'t'});
 const s=snap([m,result],[{id:'t',parentMessageId:'a',name:'bash',state:'completed',result:'ok'}],[{id:'p',toolCallId:'t',state:'approved'}]);const frozen=JSON.stringify(s);const p=new TranscriptProjector();const turns=p.project(s);
 assert.equal(turns.length,1);assert.deepEqual(turns[0].parts.map(x=>x.kind),['text','tool','text']);assert.equal(turns[0].parts[1].activity.approvals.length,1);assert.equal(JSON.stringify(s),frozen);
 assert.equal(p.project(structuredClone(s))[0],turns[0]);
});
test('missing associations retained, parallel tools not guessed into adjacent run',()=>{
 const p=new TranscriptProjector();const turns=p.project(snap([msg('a',[{type:'text',text:'hello'}],{runId:'r'})],[{id:'t',name:'read',state:'completed'}],[{id:'orphan',state:'pending'}]));
 assert.equal(turns.filter(t=>t.orphan).length,2);assert.equal(turns.find(t=>t.id==='activity:t').parts.some(p=>p.kind==='tool'),true);assert.equal(turns.find(t=>t.id==='message:a').parts.length,1);
});
test('local order resets do not move later runs before previous runs',()=>{
 const p=new TranscriptProjector();const a=msg('old',[{type:'text',text:'old'}],{order:8,runId:'r1',createdAt:'2026-01-01'});const b=msg('new',[{type:'text',text:'new'}],{order:0,runId:'r2',createdAt:'2026-01-02'});
 assert.deepEqual(p.project(snap([b,a,b])).map(t=>t.messages[0].id),['old','new']);
});
test('empty system hidden; unknown block and error completion retained as failure',()=>{
 const t=new TranscriptProjector().project(snap([msg('sys',[],{role:'system'}),msg('a',[{type:'new-provider-block',value:1}],{stopReason:'error',error:'502'})]));
 assert.equal(t.length,1);assert.deepEqual(t[0].parts.map(p=>p.kind),['unknown','error']);
});

test('canonical tool missing output uses matching result message without duplicate transcript',()=>{const t=new TranscriptProjector().project(snap([msg('a',[{type:'tool-call',toolCallId:'t',name:'read'}]),msg('result',[{type:'text',text:'actual result'}],{role:'tool',toolCallId:'t'})],[{id:'t',name:'read',state:'completed'}]));const tool=t.flatMap(x=>x.parts).find(p=>p.kind==='tool');assert.deepEqual(tool.activity.tool.result,[{type:'text',text:'actual result'}]);assert.equal(t.flatMap(x=>x.parts).filter(p=>p.kind==='tool').length,1);});

test('interleaved user instruction splits assistant turn instead of moving text across user input',()=>{const p=new TranscriptProjector();const input=[msg('a',[{type:'text',text:'before'}],{runId:'r',turnId:'t',order:0}),msg('u',[{type:'text',text:'steer'}],{runId:'r',turnId:'t',order:1,role:'user'}),msg('b',[{type:'text',text:'after'}],{runId:'r',turnId:'t',order:2})];const result=p.project(snap(input));assert.deepEqual(result.map(t=>t.messages[0].id),['a','u','b']);});

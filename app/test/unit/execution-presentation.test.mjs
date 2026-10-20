import test from 'node:test';import assert from 'node:assert/strict';
import {TranscriptProjector} from '../../src/pages/canvas/chat/project-transcript.ts';
import {groupExecutionTurns,isExecutionOnly,executionSummary} from '../../src/pages/canvas/chat/execution-presentation.ts';
const tool=(id,extra={})=>({id:'part:'+id,kind:'tool',activity:{id,tool:{id,name:'read',state:'completed',...extra},approvals:[],linked:true}});
const turn=(id,parts=[tool(id)],extra={})=>({id,role:'assistant',runId:'run',turnId:id,timestamp:'2026-01-01',messages:[{id,role:'assistant',state:'completed',blocks:[],order:0}],parts,approvals:[],orphan:false,...extra});
test('adjacent internal turns fold without altering tool/result/approval or original identities',()=>{
 const a=turn('a'),b=turn('b');a.parts[0].activity.approvals=[{id:'p',state:'pending'}];b.parts[0].activity.tool.result='original result';const before=JSON.stringify([a,b]);
 const [group]=groupExecutionTurns([a,b]);assert.equal(group.id,a.id);assert.equal(group.turnId,undefined);assert.equal(group.runId,'run');assert.deepEqual(group.sourceTurns,[a,b]);assert.equal(group.parts[1],b.parts[0]);assert.equal(group.parts[0].activity.approvals[0].state,'pending');assert.equal(JSON.stringify([a,b]),before);
 assert.equal(groupExecutionTurns([a,b])[0],group);const c=turn('c');const [grown]=groupExecutionTurns([a,b,c]);assert.equal(grown.id,group.id);assert.equal(grown.parts.length,3);assert.equal(grown.parts[0],group.parts[0]);
});
test('visible answers, user instructions, errors, orphans and run boundaries split execution groups',()=>{
 const a=turn('a'),b=turn('b');for(const boundary of [turn('user',[{id:'u',kind:'text',text:'new task'}],{role:'user'}),turn('text',[{id:'text',kind:'text',text:'findings'}]),turn('error',[{id:'err',kind:'error',error:'failed'}]),turn('orphan',[tool('x')],{role:'activity',orphan:true}),turn('other',[tool('other')],{runId:'other'})])assert.equal(groupExecutionTurns([a,boundary,b]).length,3);
 assert.equal(groupExecutionTurns([a,turn('unknown',undefined,{runId:undefined})]).length,2);
 assert.equal(groupExecutionTurns([turn('one',undefined,{runId:undefined}),turn('two',undefined,{runId:undefined})]).length,1);
});
test('thinking and whitespace-only assistant content do not create empty prose blocks',()=>{
 const p=new TranscriptProjector();const raw=p.project({messages:[{id:'a',role:'assistant',order:0,state:'completed',blocks:[{type:'text',text:'  \n '},{type:'thinking',text:'Inspect data'}]},{id:'b',role:'assistant',order:1,state:'completed',blocks:[{type:'text',text:' \n '}]}],tools:[],approvals:[],runs:[]});assert.equal(raw.length,1);assert.deepEqual(raw[0].parts.map(p=>p.kind),['thinking']);assert.equal(isExecutionOnly(raw[0]),true);
 assert.equal(isExecutionOnly(turn('text',[{id:'t',kind:'text',text:'readable response'}])),false);
});
test('summary reports failures, pending approvals and unknown outcomes rather than fabricated success',()=>{
 assert.match(executionSummary([tool('a',{state:'completed',isError:true})]).state,/失败/);
 const pending=tool('p');pending.activity.approvals=[{id:'p',state:'pending'}];assert.equal(executionSummary([pending]).state,'等待批准');
 assert.equal(executionSummary([tool('r',{state:'running'})]).state,'执行中');assert.equal(executionSummary([tool('r',{state:'running'})],false,false).state,'状态待确认');
 assert.equal(executionSummary([tool('unknown',{state:'outcome-unknown'})]).state,'状态未确认');assert.equal(executionSummary([tool('done')]).state,'已结束');
 assert.equal(executionSummary([{id:'think',kind:'thinking',text:'x'}],true).state,'思考中');
});
test('long chains retain all tools exactly once and preserve stable older groups during streaming',()=>{
 const turns=Array.from({length:100},(_,i)=>turn('step'+i));const boundary=turn('answer',[{id:'answer',kind:'text',text:'done'}]);const first=groupExecutionTurns([...turns,boundary,turn('new')]);assert.equal(first.length,3);assert.equal(first[0].parts.length,100);assert.equal(new Set(first[0].parts.map(p=>p.activity.id)).size,100);
 const update=groupExecutionTurns([...turns,boundary,turn('new',[tool('new',{state:'running'})])]);assert.equal(update[0],first[0]);assert.equal(update[1],boundary);
});

test('mixed message leading thought and trailing tool join their adjacent execution chains',()=>{
 const thought=id=>({id,kind:'thinking',text:'inspect'}),text=(id,value)=>({id,kind:'text',text:value});
 const a=turn('first',[tool('a'),thought('reason-a')]),b=turn('mixed',[thought('reason-b'),text('intro','implementation starts'),tool('bridge')]),c=turn('bulk',[tool('c'),thought('reason-c')]),d=turn('answer',[thought('reason-d'),text('answer-text','final answer')]);
 const input=[a,b,c,d],before=JSON.stringify(input),result=groupExecutionTurns(input);
 assert.equal(result.length,4);assert.deepEqual(result.map(isExecutionOnly),[true,false,true,false]);
 assert.deepEqual(result[0].parts.map(p=>p.id),['part:a','reason-a','reason-b']);assert.deepEqual(result[2].parts.map(p=>p.id),['part:bridge','part:c','reason-c','reason-d']);
 assert.deepEqual(result.flatMap(t=>t.parts),input.flatMap(t=>t.parts));assert.equal(JSON.stringify(input),before);
 assert.deepEqual(result[0].sourceTurns,[a,b]);assert.deepEqual(result[2].sourceTurns,[b,c,d]);assert.equal(groupExecutionTurns(input)[2],result[2]);
});
test('mixed fragments keep one prose footer owner, canonical source and stable keys during append',()=>{
 const before={id:'before',kind:'text',text:'before'},after={id:'after',kind:'text',text:'after'};const original=turn('mixed',[before,tool('call'),after]);
 const result=groupExecutionTurns([original]);assert.equal(result.length,3);assert.equal(result[0].hideFooter,true);assert.equal(result[2].hideFooter,false);assert.ok(result.every(t=>t.sourceTurns[0]===original));
 const growing=turn('growing',[before,tool('one')]);const first=groupExecutionTurns([growing]);const next=groupExecutionTurns([{...growing,parts:[...growing.parts,tool('two')]}]);assert.equal(first[1].id,next[1].id);
});
test('mixed-message flattening does not cross user, orphan, error or distinct run boundaries',()=>{
 const mixed=turn('mixed',[{id:'text',kind:'text',text:'intro'},tool('a')]);
 for(const blocker of [turn('user',[{id:'u',kind:'text',text:'new task'}],{role:'user'}),turn('orphan',[tool('o')],{role:'activity',orphan:true}),turn('error',[{id:'error',kind:'error',error:'failure'}]),turn('other',[tool('x')],{runId:'different'})]){
  const result=groupExecutionTurns([mixed,blocker,turn('tail')]);assert.equal(result.length,4);assert.equal(result[2],blocker);
 }
});
test('collapsed summaries omit thinking counts and tool-type inventory but retain them in expanded breakdown',()=>{
 const thought={id:'reason',kind:'thinking',text:'inspect'},summary=executionSummary([tool('a'),thought]);assert.equal(summary.title,'执行过程');assert.equal(summary.count,'1 个工具');assert.match(summary.breakdown,/read.*1 段思考/);
 const only=executionSummary([thought]);assert.equal(only.title,'思考过程');assert.equal(only.count,'');assert.match(only.breakdown,/1 段思考/);
});

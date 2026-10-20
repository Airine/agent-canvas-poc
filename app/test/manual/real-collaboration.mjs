import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import {loadEnvFile} from 'node:process';import assert from 'node:assert/strict';
if(process.env.CANVAS_COLLAB_ACCEPTANCE!=='1')throw Error('Explicit CANVAS_COLLAB_ACCEPTANCE=1 required: this runs real models and approves only Canvas test tools.');
const root=fileURLToPath(new URL('../../../',import.meta.url));
if(fs.existsSync(path.join(root,'app/.env.e')))loadEnvFile(path.join(root,'app/.env.e'));
const stage=fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR||os.tmpdir(),'canvas-collaboration-real-'));console.log('Isolated evidence directory:',stage);
process.env.CANVAS_PROJECT_ROOT=path.join(stage,'real-project');process.env.CANVAS_DATA_DIR=path.join(stage,'real-data');
fs.mkdirSync(process.env.CANVAS_PROJECT_ROOT,{recursive:true});
const {SessionManager}=await import(`${root}/app/api/e/session-manager.ts`);
const {sessionIdentities}=await import(`${root}/app/shared/agent-reference.mjs`);
const m=new SessionManager({dataDir:path.join(stage,'real-data/e'),startupMs:100000});
const wid='ws-collaboration-real';const accepted=new Set();const approvals=[],evidence={startedAt:new Date().toISOString(),kind:'real-model',approvals};
function log(...v){console.log(new Date().toISOString(),...v)}
async function wait(label,fn,ms=150000){const end=Date.now()+ms;while(Date.now()<end){await approve();const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,300));}throw Error(`Timeout ${label}`)}
async function approve(){for(const s of m.list(wid)){for(const a of s.snapshot?.approvals??[]){if(a.state!=='pending'||accepted.has(a.id))continue;const blocks=s.snapshot.messages.flatMap(x=>x.blocks).filter(b=>b.type==='tool-call'&&b.toolCallId===a.toolCallId);const args=blocks[0]?.arguments??s.snapshot.tools.find(t=>t.id===a.toolCallId)?.arguments;
 if(!['canvas_agents','canvas_publish','canvas_read','canvas_send'].includes(a.toolName))throw Error(`unexpected tool approval ${a.toolName}`);
 accepted.add(a.id);approvals.push({nodeId:s.nodeId,tool:a.toolName,args});log('approve',s.nodeId,a.toolName,JSON.stringify(args).slice(0,300));
 await m.control(wid,s.nodeId,'approval',{intentId:`real-approve-${a.id}`,approvalId:a.id,decision:'approved'});
}}}
function text(s){return s.snapshot?.messages.filter(m=>m.role==='assistant').flatMap(m=>m.blocks.filter(b=>b.type==='text').map(b=>b.text)).join('\n')??''}
try {
 const a=await m.create({workspaceId:wid,nodeId:'n-real-collab-a',title:'调查员 A',cwd:process.env.CANVAS_PROJECT_ROOT});log('A ready',a.ref);
 const b=await m.create({workspaceId:wid,nodeId:'n-real-collab-b',title:'研究员 B',cwd:process.env.CANVAS_PROJECT_ROOT});log('B ready',b.ref);
 evidence.refs=[a.ref,b.ref];assert.equal(a.collaborationAvailable,true);assert.equal(b.collaborationAvailable,true);for(const session of [a,b]){assert.equal(session.collaboration.state,'ready');assert.equal(session.collaboration.skillDiscovered,true);assert.equal(session.collaboration.instructionMode,'system-prompt');assert.equal(session.collaboration.activeTools.length,4);assert.equal(session.collaboration.loaded.bundleHash,session.collaboration.expected.bundleHash);}evidence.packages=[a.collaboration,b.collaboration];
 const ids=sessionIdentities(m.list(wid),wid),bRef=ids.get(b.nodeId).reference;
 await m.control(wid,b.nodeId,'messages',{intentId:'human-seed-b',content:'This is an isolated Canvas tool acceptance test. Call canvas_publish exactly once with title "实验结果" and content "CANVAS_ARTIFACT_7391: the measured value is 42." Then reply PUBLISHED_7391. Do not call other tools. Later if another Agent sends you CANVAS_MESSAGE_7391, reply RECEIVED_7391 with that measured value in your own chat, and do not send messages to other Agents.',deliverAs:'nextTurn'});
 await wait('B published',()=>text(m.get(wid,b.nodeId)).includes('PUBLISHED_7391')&&m.get(wid,b.nodeId).snapshot.status==='idle');
 log('B published');
 await m.control(wid,a.nodeId,'messages',{intentId:'human-seed-a',content:`This is an isolated acceptance test. Use canvas_agents to inspect the same-Canvas peer ${bRef}. Use canvas_read to read its published artifact titled 实验结果 (use returned artifact ID). Then use canvas_send exactly once to ${bRef} with message "CANVAS_MESSAGE_7391: I read the artifact. Please confirm the measured value in your own chat, without sending any Agent message." Then reply SENT_7391 with the artifact value. Do not use bash or any other tools, and do not claim the message consumed just because it was queued.`,deliverAs:'nextTurn'});
 await wait('A read and sent',()=>m.collaboration.records(wid).some(r=>r.operation==='send'));
 await wait('B consumed and replied',()=>text(m.get(wid,b.nodeId)).includes('RECEIVED_7391')&&m.collaboration.records(wid).some(r=>r.operation==='send'&&r.state==='consumed'));
 await wait('A completed',()=>text(m.get(wid,a.nodeId)).includes('SENT_7391')&&m.get(wid,a.nodeId).snapshot.status==='idle');
 const views=m.list(wid);evidence.records=m.collaboration.records(wid);evidence.edges=m.collaboration.edges(wid);evidence.replies=views.map(s=>({nodeId:s.nodeId,text:text(s),tools:s.snapshot.tools,origins:s.snapshot.messages.filter(m=>m.role==='user').map(m=>({id:m.id,origin:m.origin}))}));
 assert.equal(evidence.records.filter(r=>r.operation==='send').length,1);assert.equal(evidence.records.filter(r=>r.operation==='read').length,1);
 const incoming=views.find(v=>v.nodeId===b.nodeId).snapshot.messages.find(m=>m.origin?.kind==='agent');assert.equal(incoming?.origin?.sourceNodeId,a.nodeId);assert.equal(incoming.origin.authenticated,true);assert.equal(evidence.edges.length,2);
 evidence.passed=true;log('PASS true consumed origin + read/send edges');
} catch(e){evidence.passed=false;evidence.error=String(e);evidence.sessions=m.list(wid);log('FAIL',e);process.exitCode=1;}
finally{evidence.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(stage,'real-evidence.json'),JSON.stringify(evidence,null,2));await m.close();log('owned sessions stopped');}

import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';
if(process.env.CANVAS_REAL_E2E !== '1' || !process.env.CANVAS_TEST_URL) throw Error('Explicit CANVAS_REAL_E2E=1 and CANVAS_TEST_URL are required');
const base=process.env.CANVAS_TEST_URL,dir=process.env.CANVAS_EVIDENCE_DIR || (process.env.PI_SCRATCH_DIR ? path.join(process.env.PI_SCRATCH_DIR,'mvp') : path.resolve('test-results/real-mvp')),prior=JSON.parse(fs.readFileSync(path.join(dir,'tools-evidence.json')));const marker=prior.marker;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});const page=await browser.newPage({viewport:{width:1500,height:1100}});const evidence={};
const get=async()=> (await(await page.request.get(`${base}/api/workspaces/${prior.wid}/nodes/${prior.nid}/session`)).json()).session;
async function wait(pred,label,ms=100000){const end=Date.now()+ms;while(Date.now()<end){const s=await get();if(pred(s))return s;await new Promise(r=>setTimeout(r,300));}throw Error('timeout '+label);}
try{
 await page.goto(`${base}/canvas/${prior.wid}`);await page.getByRole('button',{name:'进入专注'}).click();const input=page.getByLabel('发送给真实 Agent 的消息');
 await input.fill(`这是运行中消息测试。请只调用一次 bash 执行 sleep 12，等待批准。不要操作文件。结束后根据收到的后续消息回答。`);await page.getByRole('button',{name:'发送',exact:true}).click();
 const pending=await wait(s=>s.snapshot.approvals?.some(a=>a.state==='pending'&&a.summary?.trim()==='sleep 12'),'sleep approval');const a=pending.snapshot.approvals.find(a=>a.state==='pending');
 await page.locator(`[data-approval-id="${a.id}"]`).getByRole('button',{name:'批准',exact:true}).click();await wait(s=>s.snapshot.tools.some(t=>t.state==='running'&&JSON.stringify(t.arguments).includes('sleep 12')),'sleep start');
 await input.fill(`请在当前任务结束后回复 ${marker}_STEER；不要调用其他工具。`);await page.getByRole('button',{name:'加入待发',exact:true}).click();await page.getByRole('button',{name:'立即发送首条待发'}).click();await page.getByRole('button',{name:'确认 Steer 发送'}).click();
 // Follow-up remains a supported runtime API, no longer a manual composer mode.
 const follow=await page.request.post(`${base}/api/workspaces/${prior.wid}/nodes/${prior.nid}/messages`,{data:{intentId:randomUUID(),content:`请在下一轮只回复 ${marker}_FOLLOWUP，不调用工具。`,deliverAs:'followUp'}});if(!follow.ok())throw Error('Follow-up API rejected');
 const done=await wait(s=>s.snapshot.messages.filter(m=>m.role==='assistant').some(m=>m.blocks.some(b=>b.text?.includes(`${marker}_FOLLOWUP`)))&&!s.snapshot.runs.some(r=>r.state==='running'),'queued messages');
 const actions=done.snapshot.pendingActions.filter(a=>a.content?.includes(`${marker}_STEER`)||a.content?.includes(`${marker}_FOLLOWUP`));evidence.queued=actions.map(a=>({deliverAs:a.deliverAs,state:a.state}));if(actions.length!==2||actions.some(a=>a.state!=='applied'))throw Error('queued actions not applied');console.log('STEER_FOLLOWUP_REAL_PASS',JSON.stringify(evidence.queued));
 const other=await browser.newPage();await other.goto(base);await other.getByLabel('画布名称').fill('MVP 隔离会话');await other.getByRole('button',{name:'创建并打开画布'}).click();await other.waitForURL('**/canvas/**',{timeout:120000});const wid=new URL(other.url()).pathname.split('/').at(-1);
 const inp=other.getByLabel('发送给真实 Agent 的消息');await inp.fill(`不要调用工具，只回复 ${marker}_ISOLATED`);await other.getByRole('button',{name:'发送',exact:true}).click();await other.getByTestId('message-assistant').filter({hasText:`${marker}_ISOLATED`}).waitFor({timeout:100000});
 if((await page.locator('body').innerText()).includes(`${marker}_ISOLATED`))throw Error('message leaked across workspaces');
 evidence.isolation={first:prior.wid,second:wid,passed:true};console.log('MULTI_WORKSPACE_REAL_PASS');
 // Add a second node without model traffic and verify stable independent native identities.
 await page.keyboard.press('Escape');const before=(await(await page.request.get(`${base}/api/workspaces/${prior.wid}`)).json()).graph.nodes.length;
 await page.getByRole('button',{name:'添加 Pi 会话'}).click();
 const end=Date.now()+120000;let nodes=[];while(Date.now()<end){nodes=(await(await page.request.get(`${base}/api/workspaces/${prior.wid}`)).json()).graph.nodes;if(nodes.length>before&&nodes.at(-1).sessionState==='ready')break;await new Promise(r=>setTimeout(r,500));}
 if(nodes.length!==before+1||nodes.at(-1).sessionState!=='ready')throw Error('second node not ready');
 if(new Set(nodes.map(n=>n.sessionRef.nativeSessionId)).size!==nodes.length)throw Error('native IDs collide');evidence.multinode={count:nodes.length,distinct:true};console.log('MULTI_NODE_REAL_PASS');
 // Only stop sessions created by this test suite. No deletion.
 for(const id of [prior.wid,wid]){const w=await(await page.request.get(`${base}/api/workspaces/${id}`)).json();for(const n of w.graph.nodes)await page.request.post(`${base}/api/workspaces/${id}/nodes/${n.id}/stop`,{data:{}});}
}catch(e){console.error(e);console.log((await page.locator('body').innerText()).slice(-3500));evidence.error=String(e);process.exitCode=1;}
finally{fs.writeFileSync(path.join(dir,'multi-evidence.json'),JSON.stringify(evidence,null,2));await browser.close();}

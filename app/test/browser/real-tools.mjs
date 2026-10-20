import {chromium} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';
if(process.env.CANVAS_REAL_E2E !== '1' || !process.env.CANVAS_TEST_URL) throw Error('Explicit CANVAS_REAL_E2E=1 and CANVAS_TEST_URL are required');
const base=process.env.CANVAS_TEST_URL,dir=process.env.CANVAS_EVIDENCE_DIR || (process.env.PI_SCRATCH_DIR ? path.join(process.env.PI_SCRATCH_DIR,'mvp') : path.resolve('test-results/real-mvp')), marker=`MVP_${Date.now()}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});const page=await browser.newPage({viewport:{width:1440,height:1100}});
fs.mkdirSync(dir,{recursive:true});
let wid,nid;const evidence={marker};
const get=async()=> (await (await page.request.get(`${base}/api/workspaces/${wid}/nodes/${nid}/session`)).json()).session;
async function wait(pred,label,ms=100000){const end=Date.now()+ms;let s;while(Date.now()<end){s=await get();if(pred(s))return s;await new Promise(r=>setTimeout(r,300));}throw Error(`timeout ${label}: ${JSON.stringify({lifecycle:s?.lifecycle,status:s?.snapshot?.status,actions:s?.snapshot?.pendingActions.map(a=>({kind:a.kind,state:a.state,reason:a.reason})),messages:s?.snapshot?.messages.slice(-2),approvals:s?.snapshot?.approvals,tools:s?.snapshot?.tools.slice(-2)})}`);}
async function send(text){await wait(s=>s.lifecycle==='ready'&&!s.snapshot.runs.some(r=>r.state==='running'),'idle');await page.getByLabel('发送给真实 Agent 的消息').fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();}
async function approvalFor(text){return wait(s=>s.snapshot.approvals?.some(a=>a.state==='pending'&&a.summary?.includes(text)),`approval ${text}`);}
async function decide(state,word){const s=await get();const a=s.snapshot.approvals.find(a=>a.state==='pending');if(!a)throw Error('no pending approval');const command=a.summary;if(!command.includes(word)||/[;`]|\$\(/.test(command)&&!command.includes('sleep 45'))throw Error('unexpected tool approval '+command);const card=page.locator(`[data-approval-id="${a.id}"]`);await card.getByRole('button',{name:state==='approved'?'批准':'拒绝',exact:true}).click();await wait(s=>s.snapshot.approvals.some(x=>x.id===a.id&&x.state===state),'approval applied');return a;}
try{
 await page.goto(base);await page.getByLabel('画布名称').fill('MVP 真实工具验收');await page.getByRole('button',{name:'创建并打开画布'}).click();await page.waitForURL('**/canvas/**',{timeout:120000});wid=new URL(page.url()).pathname.split('/').at(-1);const w=await(await page.request.get(`${base}/api/workspaces/${wid}`)).json();nid=w.graph.nodes[0].id;evidence.wid=wid;evidence.nid=nid;evidence.ref=(await get()).ref;
 await page.getByRole('button',{name:'进入专注'}).click();
 await send(`这是 MVP 工具审批测试。请只调用一次 bash 工具执行 printf '${marker}_APPROVED\\n'，等待人工批准。不要读写任何文件，不要调用其他工具。执行后报告工具实际输出。`);
 await approvalFor(`${marker}_APPROVED`);await decide('approved',`${marker}_APPROVED`);
 let s=await wait(s=>s.snapshot.tools.some(t=>t.state==='completed'&&JSON.stringify(t.result).includes(`${marker}_APPROVED`))&&!s.snapshot.runs.some(r=>r.state==='running'),'approved result');
 evidence.approve={approval:s.snapshot.approvals.at(-1).state,tool:s.snapshot.tools.at(-1).state};console.log('APPROVAL_REAL_PASS');
 await send(`接下来测试拒绝：请只调用一次 bash 工具执行 printf '${marker}_DENIED\\n'，等待人工审批。如果被拒绝，不要重试也不要换工具，只回复“已拒绝”。不要修改文件。`);
 await approvalFor(`${marker}_DENIED`);await decide('rejected',`${marker}_DENIED`);
 s=await wait(s=>s.snapshot.approvals.at(-1)?.state==='rejected'&&!s.snapshot.runs.some(r=>r.state==='running'),'denied settled');evidence.reject={approval:s.snapshot.approvals.at(-1).state,tool:s.snapshot.tools.at(-1)?.state};console.log('REJECTION_REAL_PASS');
 await send(`最后测试中断：请只调用 bash 工具执行 sleep 45，不要添加任何命令。等待人工批准后执行。若被中断不要重试，不要调用其他工具。`);
 await approvalFor('sleep 45');await decide('approved','sleep 45');await wait(s=>s.snapshot.tools.some(t=>t.state==='running'&&JSON.stringify(t.arguments).includes('sleep 45')),'sleep running');
 await page.getByRole('button',{name:'中断当前轮',exact:true}).click();
 s=await wait(s=>!s.snapshot.runs.some(r=>r.state==='running')&&s.snapshot.pendingActions.some(a=>a.kind==='abort'&&['applied','outcome-unknown','rejected'].includes(a.state)),'abort settled',60000);
 evidence.abort={action:s.snapshot.pendingActions.filter(a=>a.kind==='abort').at(-1),run:s.snapshot.runs.at(-1),tool:s.snapshot.tools.at(-1)};console.log('ABORT_REAL_STATE',evidence.abort.action.state,evidence.abort.run.state);
 await page.screenshot({path:path.join(dir,'real-tools.png'),fullPage:true});
}catch(error){console.error(error);evidence.error=String(error);console.log((await page.locator('body').innerText()).slice(-3500));process.exitCode=1;}
finally{fs.writeFileSync(path.join(dir,'tools-evidence.json'),JSON.stringify(evidence,null,2));await browser.close();}

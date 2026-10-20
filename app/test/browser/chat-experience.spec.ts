import {openDiagnostics} from './ui-actions';
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import type { SessionView, SessionMessage } from '../../api/e/contracts';
function view(nodeId='n-a',count=1):SessionView {
 const messages:SessionMessage[]=Array.from({length:count},(_,i)=>({id:`m-${nodeId}-${i}`,role:'assistant',state:'completed',order:0,runId:`r-${i}`,turnId:`t-${i}`,createdAt:new Date(1700000000000+i*1000).toISOString(),blocks:[{type:'text',text:`回复 ${nodeId} ${i}\n\n`+'正文内容。'.repeat(15)}]}));
 return {workspaceId:'w',nodeId,title:nodeId,lifecycle:'ready',version:1,updatedAt:'2026-01-01',ref:{agentSessionId:`as:${nodeId}`,nativeSessionId:`native:${nodeId}`,cwd:'/fixture'},snapshot:{id:`as:${nodeId}`,nativeSessionId:`native:${nodeId}`,epoch:'epoch',revision:1,seq:1,nextSeq:2,status:'idle',degradedReasons:[],capabilities:['send.user-message','send.steer','send.follow-up','approval.resolve','abort'].map(name=>({name,available:true,authority:'authoritative',expiresAt:'2099-01-01'})),messages,tools:[],approvals:[],pendingActions:[],runs:[]}};
}
async function setup(page:Page,views:SessionView[]) {
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 let socket:WebSocketRoute;let generation=0,sequence=0;const calls:Array<{url:string;body:unknown}>=[];let release:(()=>void)|undefined;
 await page.route('**/api/**',async route=>{const req=route.request();if(req.method()==='POST'&&req.url().endsWith('/messages')){calls.push({url:req.url(),body:req.postDataJSON()});await new Promise<void>(resolve=>{release=resolve;});return route.fulfill({status:202,json:{action:{state:'dispatched'}}});}return route.fulfill({json:{ok:true}});});
 await page.routeWebSocket('**/ws',ws=>{socket=ws;generation++;sequence=0;ws.onMessage(raw=>{if(JSON.parse(String(raw)).type==='hello'){
 ws.send(JSON.stringify({type:'graph',backend:'e',source:'live',workspaceId:'w',generation:String(generation),sequence:++sequence,graph:{nodes:views.map((v,i)=>({id:v.nodeId,title:v.title,type:'chat',backend:'e',status:'waiting',harness:'pi',env:'e-core',agentId:v.ref.agentSessionId,x:i*550,y:0,sessionRef:v.ref,sessionState:'ready',sessionStatus:'idle'})),edges:[],zones:[],runState:'idle'}}));
 for(const session of views)ws.send(JSON.stringify({type:'session',session,workspaceId:'w',generation:String(generation),sequence:++sequence}));
 }});});
 await page.goto('/canvas/w');
 return {calls,release:()=>release?.(),close:()=>socket.close(),publish:(session:SessionView)=>{session.version++;socket.send(JSON.stringify({type:'session',session,workspaceId:'w',generation:String(generation),sequence:++sequence}));}};
}
async function focus(page:Page,node='n-a'){const target=page.locator(`.react-flow__node[data-id="${node}"]`);await target.waitFor();await expect(async()=>{const dialog=page.getByRole('dialog',{name:/专注模式/});if(await dialog.isVisible())return;const compact=target.locator('.max-h-16');if(await compact.count())await compact.dblclick({timeout:2000});else await target.getByRole('button',{name:'进入专注',exact:true}).click({timeout:2000});await expect(dialog).toBeVisible({timeout:2000});}).toPass({timeout:15000});}

test('one timeline, resolved approval compact, diagnostics redacted; safe Markdown',async({page},info)=>{
 const s=view();const m=s.snapshot!.messages[0];m.blocks=[{type:'text',text:'# 可读正文\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[安全链接](https://example.com) ![远程图](https://tracking.invalid/a.png) <img src=x onerror=alert(1)>\n\n```js\nconst ok = true;\n```'},{type:'tool-call',toolCallId:'tool',name:'bash',arguments:{command:'printf ok'}},{type:'text',text:'这是后续正文'}];
 s.snapshot!.tools=[{id:'tool',name:'bash',state:'completed',parentMessageId:m.id,result:'ok'}];s.snapshot!.approvals=[{id:'approval-secret-id',toolCallId:'tool',kind:'bash',state:'approved'}];
 s.snapshot!.messages.push({...m,id:'err',runId:'old',turnId:'old',createdAt:'2020-01-01',blocks:[],error:'502 account@example.com Bearer secret-token api_key=not-public',stopReason:'error'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await setup(page,[s]);await focus(page);
 await expect(page.getByRole('heading',{name:'可读正文'})).toBeVisible();await expect(page.locator('.chat-table table')).toBeVisible();
 await expect(page.getByRole('button',{name:'批准',exact:true})).toHaveCount(0);await expect(page.getByText('approval-secret-id',{exact:true})).toHaveCount(0);
 await expect(page.getByText('本次回复失败',{exact:true})).toHaveCount(0);await expect(page.getByText('模型服务请求失败',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'查看脱敏详情'}).click();await expect(page.locator('.chat-error')).not.toContainText('account@example.com');await expect(page.locator('.chat-error')).not.toContainText('secret-token');
 await page.getByRole('button',{name:/执行过程/}).click();await expect(page.locator('[data-tool-id="tool"]')).toHaveCount(1);await page.locator('[data-tool-id="tool"]').getByRole('button').click();await expect(page.getByText('已批准',{exact:true})).toBeVisible();
 expect(requests.some(x=>x.includes('tracking.invalid'))).toBe(false);expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath('focused.png')});await page.keyboard.press('Escape');await page.screenshot({path:info.outputPath('inline.png')});
});

test('drafts survive streaming, offline, focus, L0 and refresh; IME + in-flight edit safe',async({page})=>{
 const s=view();s.snapshot!.runs=[{id:'r',state:'running'}];const h=await setup(page,[s]);await focus(page);const input=page.getByLabel('发送给真实 Agent 的消息');
 await input.fill('运行中草稿');await expect(input).toBeEnabled();await expect(page.getByRole('button',{name:'加入待发',exact:true})).toBeEnabled();
 h.close();await expect(input).toBeEnabled();await expect(page.locator('[data-notice=offline]').filter({hasText:'正在重连，草稿会保留'})).toBeVisible();await input.fill('离线草稿');
 await page.keyboard.press('Escape');await focus(page);await expect(input).toHaveValue('离线草稿');
 await page.keyboard.press('Escape');for(let i=0;i<16;i++){await page.getByRole('button',{name:'缩小',exact:true}).click();await page.waitForTimeout(160);if(await input.count()===0)break;}await expect(input).toHaveCount(0);
 await focus(page);await expect(input).toHaveValue('离线草稿');
 await page.reload();await focus(page);await expect(input).toHaveValue('离线草稿');
 s.snapshot!.runs=[];h.publish(s);await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();
 await input.dispatchEvent('compositionstart');await input.press('Enter');expect(h.calls.length).toBe(0);await input.dispatchEvent('compositionend');
 await input.press('Shift+Enter');await expect(input).toHaveValue(/\n/);await input.fill('提交这一条');await page.getByRole('button',{name:'发送',exact:true}).click();
 await expect.poll(()=>h.calls.length).toBe(1);await input.fill('提交期间写的新草稿');h.release();await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();await expect(input).toHaveValue('提交期间写的新草稿');
});

test('500 messages per node are windowed; stream in other node does not mutate focused history',async({page},info)=>{
 const views=[view('n-a',500),view('n-b',500),view('n-c',500),view('n-d',500)];const started=Date.now();const h=await setup(page,views);await focus(page,'n-a');
 const dialog=page.getByRole('dialog');await expect(dialog.locator('[data-entry-id]')).toHaveCount(30);
 await dialog.getByRole('button',{name:/加载更早/}).click();await expect(dialog.locator('[data-entry-id]')).toHaveCount(60);
 const scroller=dialog.getByRole('log');await scroller.evaluate(el=>{el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-100}));el.scrollTop=el.scrollHeight/2;el.dispatchEvent(new Event('scroll'));});const top=await scroller.evaluate(el=>el.scrollTop);
 await dialog.evaluate(el=>{const w=window as unknown as {changes:number;observer:MutationObserver};w.changes=0;w.observer=new MutationObserver(()=>w.changes++);w.observer.observe(el.querySelector('.chat-transcript')!,{childList:true,subtree:true,characterData:true});});
 for(let i=0;i<15;i++){views[1].snapshot!.messages.at(-1)!.blocks=[{type:'text',text:`stream ${i}`}];h.publish(views[1]);}
 await page.waitForTimeout(300);expect(await page.evaluate(()=>(window as unknown as {changes:number}).changes)).toBe(0);expect(Math.abs(await scroller.evaluate(el=>el.scrollTop)-top)).toBeLessThan(5);
 await page.getByRole('button',{name:/回到最新/}).click();await expect.poll(()=>scroller.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(25);
 const performance={nodes:4,messagesPerNode:500,initialMountedPerNode:30,fixtureToInteractiveMs:Date.now()-started};console.log('CHAT_PERFORMANCE',JSON.stringify(performance));await info.attach('performance.json',{body:JSON.stringify(performance),contentType:'application/json'});
});


test('pending approvals remain actionable but settled ones have no decision buttons',async({page})=>{
 const s=view();s.snapshot!.approvals=[{id:'request-1',toolCallId:'tool-1',kind:'bash',toolName:'bash',summary:'short summary',state:'pending'}];
 s.snapshot!.messages[0].blocks.push({type:'tool-call',toolCallId:'tool-1',name:'bash',arguments:{command:'printf "full command"'}});
 const h=await setup(page,[s]);await focus(page);
 await expect(page.getByTestId('approval-card')).toHaveCount(1);await expect(page.getByTestId('approval-card')).toContainText('printf "full command"');
 await expect(page.getByRole('button',{name:'批准',exact:true})).toBeEnabled();
 s.snapshot!.approvals[0].state='approved';h.publish(s);await expect(page.getByRole('button',{name:'批准',exact:true})).toHaveCount(0);await expect(page.getByTestId('approval-card')).toHaveCount(0);
 await page.getByRole('button',{name:/执行过程/}).click();await page.locator('[data-tool-id="tool-1"]').getByRole('button').click();await expect(page.getByText('已批准',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await focus(page);await expect(page.getByText('已批准',{exact:true})).toBeVisible();
});

test('unclosed long code and tool output are bounded; scroll anchor survives focus resize',async({page})=>{
 const s=view('n-a',60);const last=s.snapshot!.messages.at(-1)!;
 last.blocks=[{type:'text',text:'```unknown\n'+('long-line-'.repeat(200)+'\n').repeat(100)},{type:'tool-call',toolCallId:'large',name:'read',arguments:{path:'fixture.txt'}}];
 s.snapshot!.tools=[{id:'large',name:'read',state:'completed',parentMessageId:last.id,result:'x'.repeat(60000)}];
 await setup(page,[s]);await focus(page);
 await expect(page.getByRole('button',{name:'展开更多代码'})).toBeVisible();
 await page.getByRole('button',{name:/执行过程/}).click();await page.getByRole('button',{name:/read.*fixture/}).click();
 const output=page.locator('[data-tool-id="large"] .chat-output').last();expect((await output.innerText()).length).toBeLessThan(5000);
 await page.locator('[data-tool-id="large"]').getByRole('button',{name:/展开更多/}).click();expect((await output.innerText()).length).toBeGreaterThan(8000);
 const scroller=page.getByRole('dialog').getByRole('log');
 expect(await scroller.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThan(4);
 await scroller.evaluate(el=>{el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-100}));el.scrollTop=el.scrollHeight/2;el.dispatchEvent(new Event('scroll'));});
 await page.waitForTimeout(350);await scroller.evaluate(el=>el.dispatchEvent(new Event('scroll')));
 const anchor=await scroller.evaluate(el=>{const top=el.getBoundingClientRect().top;const row=[...el.querySelectorAll<HTMLElement>('[data-entry-id]')].find(x=>x.getBoundingClientRect().bottom>top)!;return row.dataset.entryId;});
 await page.keyboard.press('Escape');await focus(page);
 await expect.poll(()=>page.getByRole('dialog').getByRole('log').evaluate(el=>{const top=el.getBoundingClientRect().top;return [...el.querySelectorAll<HTMLElement>('[data-entry-id]')].find(x=>x.getBoundingClientRect().bottom>top)?.dataset.entryId;})).toBe(anchor);
});


test('stream keeps focus and draft; duplicate frames and sequence gap resync without replay',async({page})=>{
 const s=view();let socket:WebSocketRoute;let generation=0,seq=0,hellos=0;
 await page.route('**/api/**',r=>r.fulfill({json:{ok:true}}));
 await page.routeWebSocket('**/ws',ws=>{socket=ws;ws.onMessage(raw=>{if(JSON.parse(String(raw)).type!=='hello')return;hellos++;generation++;seq=0;
 ws.send(JSON.stringify({type:'graph',backend:'e',workspaceId:'w',generation:String(generation),sequence:++seq,graph:{nodes:[{id:s.nodeId,title:'Pi',type:'chat',backend:'e',status:'waiting',harness:'pi',env:'e-core',agentId:s.ref.agentSessionId,x:0,y:0,sessionRef:s.ref}],edges:[],zones:[],runState:'idle'}}));
 ws.send(JSON.stringify({type:'session',session:s,workspaceId:'w',generation:String(generation),sequence:++seq}));});});
 await page.goto('/canvas/w');await focus(page);const input=page.getByLabel('发送给真实 Agent 的消息');await input.fill('尚未发送的草稿');
 for(let i=0;i<5;i++){s.version++;s.snapshot!.messages[0].blocks=[{type:'text',text:`更新 ${i}`}];socket!.send(JSON.stringify({type:'session',session:s,workspaceId:'w',generation:String(generation),sequence:++seq}));}
 await expect(input).toBeFocused();await expect(input).toHaveValue('尚未发送的草稿');
 socket!.send(JSON.stringify({type:'session',session:{...s,version:0},workspaceId:'w',generation:String(generation),sequence:seq}));
 socket!.send(JSON.stringify({type:'session',session:s,workspaceId:'w',generation:String(generation),sequence:seq+5}));
 await expect.poll(()=>hellos).toBe(2);await expect(input).toHaveValue('尚未发送的草稿');await expect(page.getByText('更新 4',{exact:true})).toBeVisible();
});

test('legacy herdr terminal focus still mounts without chat-specific controls',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:[]}));
 await page.routeWebSocket('**/ws',ws=>ws.onMessage(raw=>{if(JSON.parse(String(raw)).type==='hello')ws.send(JSON.stringify({type:'graph',backend:'herdr',source:'demo',workspaceId:'legacy',generation:'h',sequence:1,graph:{nodes:[{id:'terminal',type:'operation',title:'Legacy terminal',status:'running',paneId:'pane',harness:'shell',env:'local',agentId:'agent',x:0,y:0}],edges:[],zones:[],runState:'running'}}));}));
 await page.goto('/canvas/legacy');await page.getByRole('button',{name:'进入专注'}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.xterm').first()).toBeVisible();await expect(page.locator('.chat-composer')).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('session diagnostics opens from header without occupying transcript; Escape preserves focus mode',async({page})=>{
 const s=view();s.error='upstream account@example.com Bearer private-token';
 await setup(page,[s]);await focus(page);
 const focusDialog=page.getByRole('dialog',{name:/专注模式/});
 const input=page.getByLabel('发送给真实 Agent 的消息');await input.fill('诊断期间保留的草稿');
 await expect(page.getByRole('log').getByRole('button',{name:'会话诊断',exact:true})).toHaveCount(0);
 await expect(page.getByRole('log').getByRole('button',{name:'技术详情',exact:true})).toHaveCount(0);
 const trigger=page.locator('.chat-session-header').getByRole('button',{name:'会话操作',exact:true});
 await openDiagnostics(page);
 const diagnostic=page.getByRole('dialog',{name:'会话诊断',exact:true});await expect(diagnostic).toBeVisible();
 await expect(diagnostic).toContainText('native:n-a');await expect(diagnostic).not.toContainText('account@example.com');await expect(diagnostic).not.toContainText('private-token');
 await page.keyboard.press('Escape');await expect(diagnostic).toHaveCount(0);await expect(focusDialog).toBeVisible();await expect(trigger).toBeFocused();await expect(input).toHaveValue('诊断期间保留的草稿');
 await page.keyboard.press('Escape');await expect(focusDialog).toHaveCount(0);
 await openDiagnostics(page);await expect(diagnostic).toBeVisible();await page.getByRole('button',{name:'关闭会话诊断'}).click();await expect(diagnostic).toHaveCount(0);
});


test('assisted distinguishes rule interception, AI review and e confirmation without remounting draft',async({page},info)=>{
 const s=view();s.approvalMode='assisted';s.approvalPolicyVersion=2;s.approvalReviewer={provider:'fixture',model:'reviewer'};
 s.snapshot!.approvals=[{id:'p',toolCallId:'t',kind:'bash',toolName:'bash',state:'pending'}];s.snapshot!.messages[0].blocks.push({type:'tool-call',toolCallId:'t',name:'bash',arguments:{command:'cat "sample.json" | head -20'}});
 const audit=(state:'reviewing'|'manual'|'failed'|'submitted',attempted:boolean)=>{s.approvalAudit=[{approvalId:'p',digest:'fixture',source:attempted?'ai':'manual',state,reviewAttempted:attempted,reason:'synthetic review evidence',rule:'inspectable-shell-v2',at:new Date().toISOString()}];};
 audit('manual',false);const h=await setup(page,[s]);await focus(page);const card=page.getByTestId('approval-card'),input=page.getByLabel('发送给真实 Agent 的消息');
 await input.fill('审批期间保留草稿');await input.evaluate(el=>{(window as unknown as {savedInput:Element}).savedInput=el;});
 await expect(card.getByTestId('approval-review-status')).toContainText('规则转人工 · 未调用 AI');await expect(card.locator('header')).toContainText('需要你的批准');
 audit('reviewing',true);h.publish(s);await expect(card.locator('header')).toContainText('AI 正在审查');await expect(page.locator('[data-notice=approval]')).toContainText('无需重复点批准');await expect(card.getByRole('button',{name:'批准',exact:true})).toBeEnabled();
 await page.screenshot({path:info.outputPath('assisted-reviewing.png')});
 audit('manual',true);h.publish(s);await expect(card.getByTestId('approval-review-status')).toContainText('AI 审查后转人工');
 audit('failed',true);h.publish(s);await expect(card.getByTestId('approval-review-status')).toContainText('失败');
 audit('submitted',true);h.publish(s);await expect(card.locator('header')).toContainText('等待审批确认');await expect(card).toBeVisible();await expect(card.getByTestId('approval-review-status')).toContainText('执行状态待 e 确认');
 await expect(input).toHaveValue('审批期间保留草稿');expect(await input.evaluate(el=>el===(window as unknown as {savedInput:Element}).savedInput)).toBe(true);
 await page.getByRole('dialog',{name:/专注模式/}).getByRole('button',{name:'权限设置',exact:true}).click();const menu=page.getByRole('dialog',{name:'权限设置',exact:true});await menu.locator('summary').filter({hasText:'授权范围与记录'}).click();await expect(menu).toContainText('审批策略 v2');await expect(menu.getByTestId('approval-policy-legacy')).toHaveCount(0);
 await page.keyboard.press('Escape');s.snapshot!.approvals![0].state='approved';h.publish(s);await expect(card).toHaveCount(0);
});

test('hot updated UI warns when assisted backend has not reported policy v2',async({page})=>{
 const s=view();s.approvalMode='assisted';s.approvalReviewer={provider:'fixture',model:'reviewer'};await setup(page,[s]);await focus(page);
 await page.getByRole('dialog',{name:/专注模式/}).getByRole('button',{name:'权限设置',exact:true}).click();const menu=page.getByRole('dialog',{name:'权限设置',exact:true});await expect(menu.getByTestId('approval-policy-legacy')).toContainText('前端刷新不代表后端已更新');
});


test('empty system message does not render a failure notice',async({page})=>{
 const s=view();s.snapshot!.messages=[{id:'sys',role:'system',order:0,state:'completed',blocks:[{type:'text',text:''}]},{id:'m',role:'assistant',state:'completed',order:1,blocks:[{type:'text',text:'可见回复'}]}];
 const h=await setup(page,[s]);await focus(page);await expect(page.locator('.chat-error')).toHaveCount(0);await expect(page.getByText('可见回复')).toBeVisible();expect(h.calls).toEqual([]);
});

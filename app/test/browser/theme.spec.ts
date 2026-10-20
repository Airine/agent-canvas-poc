import {openDiagnostics} from './ui-actions';
import { test, expect, type Page } from '@playwright/test';

async function canvas(page:Page,terminal=false){
 const nodeId=terminal?'term':'chat';const ref={agentSessionId:'as:theme',nativeSessionId:'native:theme',cwd:'/fixture'};
 const session={workspaceId:'theme',nodeId,title:'Theme Agent',lifecycle:'ready',version:1,ref,updatedAt:'2026-01-01',snapshot:{id:ref.agentSessionId,nativeSessionId:ref.nativeSessionId,epoch:'e',revision:1,seq:1,nextSeq:2,status:'idle',runs:[],degradedReasons:[],capabilities:[{name:'send.user-message',available:true,authority:'authoritative',expiresAt:'2099-01-01'}],messages:[{id:'msg',role:'assistant',state:'completed',order:0,blocks:[{type:'text',text:'# 主题预览\n\n普通文字与 **重点**。\n\n```js\nconst answer = 42;\n```\n\n| Name | State |\n|---|---|\n| Agent | Ready |'}]}],tools:[],approvals:[],pendingActions:[]}};
 await page.route('**/api/**',route=>route.fulfill({json:[]}));
 let subscriptions=0;const writes:string[]=[];
 await page.routeWebSocket('**/ws',ws=>{let seq=0;const send=(message:object)=>ws.send(JSON.stringify({...message,workspaceId:'theme',generation:'g',sequence:++seq}));ws.onMessage(raw=>{
  const msg=JSON.parse(String(raw));if(msg.type==='hello'){
   send({type:'graph',backend:terminal?'herdr':'e',source:'live',graph:{nodes:[{id:nodeId,type:terminal?'operation':'chat',backend:terminal?'herdr':'e',title:'Theme Agent',status:terminal?'running':'waiting',harness:terminal?'shell':'pi',env:'local',agentId:'agent',x:50,y:50,...(terminal?{paneId:'pane'}:{sessionRef:ref,sessionState:'ready',sessionStatus:'idle'})}],edges:[],zones:[],runState:'idle'}});
   if(!terminal)send({type:'session',session});
  }else if(msg.type==='term.subscribe'){subscriptions++;send({type:'term',nodeId,ansi:'THEME_TERMINAL_BUFFER\r\n\x1b[31mRED\x1b[0m\r\n'});}
 });});
 page.on('request',req=>{if(req.method()==='POST')writes.push(req.url());});
 await page.goto('/canvas/theme');return {subscriptions:()=>subscriptions,writes};
}
const rootColor=(page:Page,name:string)=>page.evaluate(n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(),name);

test('three theme choices persist and system updates live without overriding explicit preference',async({page,context})=>{
 await page.emulateMedia({colorScheme:'light'});await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'fixture offline'}}));await page.goto('/');
 const picker=page.getByRole('combobox',{name:'主题配色'});await expect(picker).toHaveValue('system');await expect(page.locator('html')).toHaveClass('light');expect(await rootColor(page,'--canvas-bg')).toBe('#F3F5FA');
 await picker.selectOption('dark');await expect(page.locator('html')).toHaveClass('dark');expect(await page.evaluate(()=>localStorage.getItem('agent-canvas-theme'))).toBe('dark');
 await page.reload();await expect(picker).toHaveValue('dark');await expect(page.locator('html')).toHaveClass('dark');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveClass('dark');
 await picker.selectOption('system');await expect(page.locator('html')).toHaveClass('light');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveClass('dark');
 await picker.selectOption('light');await expect(page.locator('html')).toHaveClass('light');
 const second=await context.newPage();await second.route('**/api/**',r=>r.fulfill({status:503,json:{error:'fixture offline'}}));await second.goto('/');await expect(second.locator('html')).toHaveClass('light');
 await picker.selectOption('dark');await expect(second.locator('html')).toHaveClass('dark');await second.close();
});

test('chat, code, focus and diagnosis change palette without losing draft or mounting a new conversation',async({page},info)=>{
 await page.emulateMedia({colorScheme:'dark'});const h=await canvas(page);
 await page.getByRole('button',{name:'进入专注'}).click();const focus=page.getByRole('dialog',{name:/专注模式/});const picker=page.getByRole('combobox',{name:'主题配色'});
 const input=page.getByLabel('发送给真实 Agent 的消息');await input.fill('主题切换保留草稿');
 await input.evaluate(el=>(window as unknown as {originalInput:Element}).originalInput=el);
 const token=page.locator('.chat-code code span[style]').first();await expect(token).toBeVisible({timeout:15000});const dark=await token.evaluate(el=>getComputedStyle(el).color);
 await picker.selectOption('light');await expect(page.locator('html')).toHaveClass('light');await expect.poll(()=>token.evaluate(el=>getComputedStyle(el).color)).not.toBe(dark);
 expect(await input.evaluate(el=>el===(window as unknown as {originalInput:Element}).originalInput)).toBe(true);await expect(input).toHaveValue('主题切换保留草稿');
 expect(await focus.evaluate(el=>getComputedStyle(el.querySelector('[tabindex="-1"]')!).backgroundColor)).toBe('rgb(255, 255, 255)');
 await page.screenshot({path:info.outputPath('light-focus.png')});
 await openDiagnostics(page);const diagnostics=page.getByRole('dialog',{name:'会话诊断',exact:true});await expect(diagnostics).toBeVisible();expect(await diagnostics.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
 await page.keyboard.press('Escape');await expect(focus).toBeVisible();await picker.selectOption('dark');await expect.poll(()=>token.evaluate(el=>getComputedStyle(el).color)).toBe(dark);
 await page.screenshot({path:info.outputPath('dark-focus.png')});await expect(input).toHaveValue('主题切换保留草稿');expect(h.writes).toEqual([]);
 await page.keyboard.press('Escape');await page.getByRole('combobox',{name:'主题配色'}).selectOption('light');
 const mask=page.locator('.react-flow__minimap-mask');await expect(mask).toBeVisible();expect(await mask.evaluate(el=>getComputedStyle(el).fill)).toBe('rgba(243, 245, 250, 0.72)');
 await page.screenshot({path:info.outputPath('light-canvas.png')});
});

test('terminal theme repaints existing instance, keeps buffer and does not resubscribe',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});const h=await canvas(page,true);await page.getByRole('button',{name:'进入专注'}).click();
 const terminal=page.locator('.xterm').first();await expect(terminal).toBeVisible();await terminal.evaluate(el=>(window as unknown as {originalTerm:Element}).originalTerm=el);
 const viewport=page.locator('.xterm-viewport').first();await expect.poll(()=>viewport.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(10, 12, 16)');const subscriptions=h.subscriptions();
 const picker=page.getByRole('combobox',{name:'主题配色'});await picker.selectOption('light');
 await expect.poll(()=>viewport.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(248, 250, 253)');
 expect(await terminal.evaluate(el=>el===(window as unknown as {originalTerm:Element}).originalTerm)).toBe(true);expect(h.subscriptions()).toBe(subscriptions);
 await picker.selectOption('system');await page.emulateMedia({colorScheme:'dark'});await expect.poll(()=>viewport.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(10, 12, 16)');expect(h.writes).toEqual([]);
});

test('public pages inherit light palette and secondary text stays readable',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'fixture offline'}}));
 for(const url of ['/','/welcome','/react-flow','/tldraw']){
  await page.goto(url);await expect(page.locator('html')).toHaveClass('light');await expect(page.getByRole('combobox',{name:'主题配色'}).first()).toHaveValue('system');
  expect(await rootColor(page,'--text-primary')).toBe('#182236');expect(await page.evaluate(()=>CSS.supports('color',getComputedStyle(document.documentElement).getPropertyValue('--accent')))).toBe(true);
 }
});


test('blocked localStorage still permits in-memory theme switching',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.getItem=function(){throw new DOMException('blocked','SecurityError');};Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError');};});
 await page.emulateMedia({colorScheme:'light'});await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'fixture offline'}}));
 await page.goto('/');const picker=page.getByRole('combobox',{name:'主题配色'});await picker.selectOption('dark');await expect(page.locator('html')).toHaveClass('dark');await picker.selectOption('light');await expect(page.locator('html')).toHaveClass('light');
});

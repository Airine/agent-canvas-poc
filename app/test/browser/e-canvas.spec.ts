import {stopSession} from './ui-actions';
import { test, expect } from '@playwright/test';

// Explicit protocol fixtures: these are UI tests, NOT evidence of a model reply.
function fixture(id: string) {
 const ref = { agentSessionId: `as:${id}`, nativeSessionId: `native:${id}`, cwd: '/fixture/project', provider: 'fixture', model: 'fixture-model' };
 const session = { workspaceId:id,nodeId:`n-${id}`,title:'Fixture Pi',lifecycle:'ready',ref,updatedAt:new Date().toISOString(),version:1,
 snapshot:{id:ref.agentSessionId,nativeSessionId:ref.nativeSessionId,epoch:'e1',revision:1,seq:1,nextSeq:2,status:'idle',capabilities:[{name:'send.user-message',available:true,authority:'authoritative'}],degradedReasons:[],runs:[],tools:[],approvals:[],pendingActions:[],messages:[{id:'m1',role:'assistant',state:'completed',order:0,blocks:[{type:'text',text:`Fixture reply for ${id}`}]}]}};
 const graph = {nodes:[{id:session.nodeId,title:session.title,type:'chat',backend:'e',status:'waiting',harness:'pi',env:'e-core',agentId:ref.agentSessionId,x:80,y:80,sessionRef:ref,sessionState:'ready',sessionStatus:'idle',summary:`Fixture reply for ${id}`}],edges:[],zones:[],runState:'idle'};
 return {session,graph,workspace:{id,title:'Fixture canvas',path:ref.cwd,backend:'e',source:'live',graph,status:'idle',createdAt:new Date().toISOString(),lastActiveAt:new Date().toISOString(),description:''}};
}

test('automatic layout fits the viewport after distant node patches', async ({page}) => {
 const f=fixture('w-layout');
 let socket:import('@playwright/test').WebSocketRoute, seq=0;
 const send=(message:Record<string,unknown>)=>socket.send(JSON.stringify({...message,workspaceId:f.workspace.id,generation:'layout',sequence:++seq}));
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/layout') && route.request().method()==='POST') {
   f.graph.nodes[0].x=6000;f.graph.nodes[0].y=4000;
   send({type:'node',node:f.graph.nodes[0]});
   return route.fulfill({json:{ok:true}});
  }
  return route.fulfill({json:url.pathname.endsWith('/session')?{session:f.session}:f.workspace});
 });
 await page.routeWebSocket('**/ws',ws=>{socket=ws;ws.onMessage(raw=>{
  if(JSON.parse(String(raw)).type==='hello') {
   send({type:'graph',graph:f.graph,backend:'e',source:'live'});
   send({type:'session',session:f.session});
  }
 });});
 await page.goto('/canvas/w-layout');
 const node=page.locator('.react-flow__node').first();
 await expect(node).toBeInViewport();
 const viewport=page.locator('.react-flow__viewport');
 const before=await viewport.getAttribute('style');
 await page.getByRole('button',{name:'一键最优布局',exact:true}).click();
 await expect.poll(()=>viewport.getAttribute('style')).not.toBe(before);
 await expect(node).toBeInViewport();
 // Record the settled view, not a frame midway through the 400ms fit animation.
 await page.waitForTimeout(600);
 await page.screenshot({path:'test-results/layout-regression.png'});
});

test('e canvas displays structured session, remains scoped and survives refresh without demo', async ({page}) => {
 const a=fixture('w-a'), b=fixture('w-b');
 await page.route('**/api/**',route=> {
  const url=new URL(route.request().url());
  const data=url.pathname.endsWith('/session')?{session:a.session}:url.pathname==='/api/workspaces'?{workspaces:[a.workspace]}:url.pathname.endsWith('/graph')?a.graph:a.workspace;
  return route.fulfill({json:data});
 });
 await page.routeWebSocket('**/ws', ws=> {
  let seq=0;
  ws.onMessage(raw=> {
   const message=JSON.parse(String(raw)); if(message.type!=='hello')return;
   const generation=String(Date.now());
   ws.send(JSON.stringify({type:'graph',graph:a.graph,backend:'e',source:'live',workspaceId:'w-a',generation,sequence:++seq}));
   ws.send(JSON.stringify({type:'session',session:a.session,workspaceId:'w-a',generation,sequence:++seq}));
   ws.send(JSON.stringify({type:'session',session:b.session,workspaceId:'w-b',generation,sequence:++seq}));
  });
 });
 await page.goto('/canvas/w-a');
 await expect(page.getByText('Fixture reply for w-a').first()).toBeVisible();
 await expect(page.getByText('Fixture reply for w-b')).toHaveCount(0);
 await expect(page.getByText('本地 mock 数据')).toHaveCount(0);
 await expect(page.getByText('herdr 真实驱动')).toHaveCount(0);
 await page.reload();
 await expect(page.getByText('Fixture reply for w-a').first()).toBeVisible();
});

test('missing API on home never invents a demo workspace', async ({page}) => {
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'fixture offline'}}));
 await page.goto('/');
 await expect(page.getByText('数据管线演示')).toHaveCount(0);
 await expect(page.getByText('C:/work/agent-canvas')).toHaveCount(0);
});


test('fixture controls, focus, layout, reconnect and stop/resume stay in canvas', async ({page}) => {
 const f=fixture('w-control');const calls:Array<{path:string;body:Record<string,unknown>}>=[];let socket:import('@playwright/test').WebSocketRoute;let seq=0;let gen=0;
 const snapshot=f.session.snapshot as unknown as Record<string,unknown>;
 snapshot.capabilities=['send.user-message','send.steer','send.follow-up','abort','approval.resolve'].map(name=>({name,available:true,authority:'authoritative',expiresAt:'2099-01-01'}));
 snapshot.runs=[];snapshot.approvals=[{id:'approval-fixture',kind:'tool',state:'pending',toolName:'read',summary:'Fixture read permission'}];
 const publish=()=>socket.send(JSON.stringify({type:'session',session:f.session,workspaceId:f.workspace.id,generation:String(gen),sequence:++seq}));
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());const method=route.request().method();const body=method==='GET'?{}:route.request().postDataJSON();
  if(method!=='GET')calls.push({path:url.pathname,body});
  if(url.pathname.endsWith('/messages')) {
   f.session.version++;snapshot.pendingActions=[{id:'action-fixture',kind:'send',state:'applied'}];
   f.session.snapshot.messages.push({id:'reply-fixture',role:'assistant',state:'completed',order:2,blocks:[{type:'text',text:'Fixture control reply'}]});publish();return route.fulfill({status:202,json:{action:{id:'action-fixture',state:'dispatched'}}});
  }
  if(url.pathname.endsWith('/approval')){snapshot.approvals=[{id:'approval-fixture',kind:'tool',state:body.decision}];f.session.version++;publish();return route.fulfill({status:202,json:{action:{state:'applied'}}});}
  if(url.pathname.endsWith('/stop')||url.pathname.endsWith('/resume')){f.session.lifecycle=url.pathname.endsWith('/stop')?'stopped':'ready';f.session.version++;publish();return route.fulfill({json:{session:f.session}});}
  if(url.pathname.endsWith('/layout'))return route.fulfill({json:{ok:true}});
  return route.fulfill({json:url.pathname.endsWith('/session')?{session:f.session}:f.workspace});
 });
 await page.routeWebSocket('**/ws',ws=>{socket=ws;gen++;seq=0;ws.onMessage(raw=>{if(JSON.parse(String(raw)).type==='hello'){
  ws.send(JSON.stringify({type:'graph',graph:f.graph,backend:'e',source:'live',workspaceId:f.workspace.id,generation:String(gen),sequence:++seq}));publish();
 }});});
 await page.goto('/canvas/w-control');
 await page.getByRole('button',{name:'进入专注'}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('button',{name:'批准',exact:true}).click();expect(calls.find(c=>c.path.endsWith('/approval'))?.body.approvalId).toBe('approval-fixture');
 await page.getByLabel('发送给真实 Agent 的消息').fill('Fixture whole message');await page.getByRole('button',{name:'发送',exact:true}).click();
 await expect(page.getByText('Fixture control reply')).toBeVisible();
 const sent=calls.find(c=>c.path.endsWith('/messages'))!;expect(sent.body.content).toBe('Fixture whole message');expect(sent.body.intentId).toBeTruthy();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 const node=page.locator('.react-flow__node').first();const box=await node.boundingBox();
 await page.mouse.move(box!.x+100,box!.y+35);await page.mouse.down();await page.mouse.move(box!.x+180,box!.y+100,{steps:5});await page.mouse.up();
 await expect.poll(()=>calls.some(c=>c.path.endsWith('/layout'))).toBeTruthy();
 socket!.close();await expect(page.getByLabel('发送给真实 Agent 的消息')).toBeEnabled();await expect(page.getByRole('button',{name:'发送',exact:true})).toBeDisabled();
 await expect(page.getByLabel('发送给真实 Agent 的消息')).toBeEnabled({timeout:15000});
 await expect(page.getByText('Fixture control reply')).toBeVisible();
 await stopSession(page);await expect(page.getByRole('button',{name:'恢复会话',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'恢复会话',exact:true}).click();await expect(page.getByLabel('发送给真实 Agent 的消息')).toBeEnabled();
});

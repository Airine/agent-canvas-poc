import {setCardView} from '../ui-actions';
import {type Page,type WebSocketRoute} from '@playwright/test';
import type {SessionView,QueueMutation} from '../../../api/e/contracts';
import {emptyQueue,mutateQueue} from '../../../api/e/message-queue';
export function session():SessionView {
 const model={provider:'fixture',id:'vision',name:'Fixture vision',input:['text','image'],contextWindow:10000};
 return {workspaceId:'desktop',nodeId:'a',title:'验收 Agent',lifecycle:'ready',approvalMode:'manual',version:1,updatedAt:'2026-01-01',ref:{agentSessionId:'as:a',nativeSessionId:'native:a',cwd:'/fixture'},queue:emptyQueue(),configuration:{nativeSessionId:'native:a',revision:1,confirmedAt:'2026-01-01T12:00:00Z',model,models:[model,{...model,id:'text',input:['text']}],thinkingLevel:'low',thinkingLevels:['low','high'],contextUsage:{tokens:250,contextWindow:10000,percent:2.5}},snapshot:{id:'as:a',nativeSessionId:'native:a',epoch:'e',revision:1,seq:1,nextSeq:2,status:'idle',messages:[{id:'u',role:'user',state:'completed',order:1,blocks:[{type:'text',text:'历史输入没有可信来源'}]},{id:'m',role:'assistant',state:'completed',order:2,blocks:[{type:'text',text:'可读回复'}]}],runs:[],tools:[],approvals:[],pendingActions:[],degradedReasons:[],capabilities:['send.user-message','send.steer','send.follow-up','abort'].map(name=>({name,available:true,authority:'authoritative',expiresAt:'2099-01-01'}))}};
}
export async function setup(page:Page,active=false,custom?:SessionView){
 const s=custom??session();if(active){s.snapshot!.runs=[{id:'r',state:'running'}];s.snapshot!.status='live';}
 let ws:WebSocketRoute,seq=0,generation=0,receipt='dispatched',configFailure=false,queueConflict=false;
 const calls:Array<{operation:string;body:Record<string,unknown>}>=[];
 const publish=()=>{s.version++;ws.send(JSON.stringify({type:'session',workspaceId:'desktop',generation:String(generation),sequence:++seq,session:s}));};
 const publishLifecycle=(view:SessionView)=>{
  ws.send(JSON.stringify({type:'node',workspaceId:'desktop',generation:String(generation),sequence:++seq,node:{id:'a',type:'chat',title:view.title,backend:'e',status:'waiting',harness:'pi',env:'e',agentId:view.ref.agentSessionId,sessionRef:view.ref,x:0,y:0,archivedAt:view.archivedAt}}));
  ws.send(JSON.stringify({type:'session',workspaceId:'desktop',generation:String(generation),sequence:++seq,session:view}));
 };
 await page.route('**/api/**',async route=>{
  const operation=new URL(route.request().url()).pathname.split('/').at(-1)!;
  const body=route.request().postDataJSON()??{};
  if(['messages','queue','configuration','abort','stop'].includes(operation))calls.push({operation,body});
  if(new URL(route.request().url()).pathname==='/api/runtime/status')return route.fulfill({json:{available:true,models:[],...(s.sessionLifecycleVersion?{sessionLifecycleVersion:s.sessionLifecycleVersion}:{})}});
  if(operation==='messages')return route.fulfill({status:202,json:{action:{state:receipt,reason:receipt==='dispatched'?undefined:'fixture receipt'}}});
  if(operation==='configuration'){
   if(configFailure){configFailure=false;return route.fulfill({status:409,json:{error:'配置未确认：fixture readback failed'}});}
   if(body.intentId){if(s.snapshot!.runs.some(r=>r.state==='running'))return route.fulfill({status:409,json:{error:'执行中不可改配置'}});if(body.thinkingLevel)s.configuration!.thinkingLevel=body.thinkingLevel;if(body.model)s.configuration!.model=s.configuration!.models.find(m=>m.id===body.model)!;s.configuration!.revision++;}
   s.version++;return route.fulfill({json:{session:s}});
  }
  if(operation==='queue'){
   if(queueConflict){queueConflict=false;publish();return route.fulfill({status:409,json:{error:'队列版本冲突，请刷新后重试'}});}
   try{mutateQueue(s.queue!,body as QueueMutation);if(body.operation==='sendNow'){const item=s.queue!.items.find(i=>i.id===body.itemId)!;item.state='submitted';}s.version++;return route.fulfill({json:{session:s}});}catch(e){return route.fulfill({status:409,json:{error:String(e)}});}
  }
  return route.fulfill({json:{ok:true}});
 });
 await page.routeWebSocket('**/ws',socket=>{ws=socket;generation++;seq=0;socket.onMessage(raw=>{if(JSON.parse(String(raw)).type!=='hello')return;socket.send(JSON.stringify({type:'graph',workspaceId:'desktop',generation:String(generation),sequence:++seq,backend:'e',source:'live',graph:{nodes:[{id:'a',type:'chat',title:s.title,backend:'e',status:'waiting',harness:'pi',env:'e',agentId:s.ref.agentSessionId,sessionRef:s.ref,x:0,y:0}],edges:[],zones:[],runState:'idle'}}));publish();});});
 await page.goto('/canvas/desktop');await focus(page);
 return {s,calls,publish,publishLifecycle,receipt:(value:string)=>{receipt=value;},failConfig:()=>{configFailure=true;},conflict:()=>{queueConflict=true;}};
}
export async function focus(page:Page){await page.getByRole('button',{name:'复位到 100%'}).click();const card=page.locator('.react-flow__node[data-id="a"]');await setCardView(page,card,'detail');await card.getByRole('button',{name:'进入专注'}).click();}
export const input=(page:Page)=>page.getByLabel('发送给真实 Agent 的消息');

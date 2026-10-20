import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const dir = fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'canvas-routes-'));
process.env.CANVAS_DATA_DIR = dir;
process.env.CANVAS_EVENTS_LOG = path.join(dir, 'events.jsonl');
const { api, wsHandlers, wireBroadcasts } = await import('../../api/routes.ts');
const { registry } = await import('../../api/registry.ts');
const { eSessions } = await import('../../api/e-adapter.ts');
const { getGraphStore } = await import('../../api/graph.ts');
const { localRequestAllowed } = await import('../../api/local-access.ts');
const { eventbus } = await import('../../api/eventbus.ts');
wireBroadcasts();
const request = (url, method='GET', body) => api.request(url, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
const make = async () => (await request('/workspaces','POST',{title:'Route fixture',backend:'e'})).json();
test.after(async () => { await eSessions.close(); fs.rmSync(dir, { recursive:true, force:true }); });

test('e workspace is empty, local and never accepts demo nodes as live', async () => {
 const w = await make(); assert.equal(w.backend, 'e'); assert.equal(w.source, 'live'); assert.deepEqual(w.graph.nodes, []);
 const res = await request(`/workspaces/${w.id}/run`, 'POST', {}); assert.equal(res.status,409);
 assert.equal((await request('/e/sessions/bind','POST',{})).status,410);
 assert.equal((await request('/workspaces/missing/sessions','POST',{})).status,404);
});
test('WS subscriptions isolate workspaces and missing hello does not fall back', async () => {
 const a=await make(), b=await make(), messagesA=[],messagesB=[];
 const wa={send:data=>messagesA.push(JSON.parse(data))},wb={send:data=>messagesB.push(JSON.parse(data))};
 wsHandlers.onOpen(null,wa);wsHandlers.onOpen(null,wb);
 wsHandlers.onMessage({data:JSON.stringify({type:'hello',workspaceId:a.id})},wa);
 wsHandlers.onMessage({data:JSON.stringify({type:'hello',workspaceId:b.id})},wb);
 getGraphStore(a.id).upsertNode({id:'fixture-node',title:'x',type:'chat',status:'waiting',harness:'pi',env:'e',agentId:'a',x:0,y:0});
 assert.equal(messagesA.at(-1).type,'node'); assert.equal(messagesB.length,1);
 const generation=messagesA[0].generation;
 wsHandlers.onMessage({data:JSON.stringify({type:'hello',workspaceId:a.id})},wa);
 assert.notEqual(messagesA.at(-1).generation,generation);assert.equal(messagesA.at(-1).sequence,1);
 wsHandlers.onMessage({data:JSON.stringify({type:'hello',workspaceId:'missing'})},wa);
 assert.equal(messagesA.at(-1).type,'error');
 wsHandlers.onClose(null,wa);wsHandlers.onClose(null,wb);
});
test('control API preserves intent ID and enforces workspace membership', async t => {
 const w = await make();
 const view={workspaceId:w.id,nodeId:'n',lifecycle:'ready'};
 t.mock.method(eSessions,'get',(wid,nid)=>wid===w.id&&nid==='n'?view:undefined);
 let received;
 t.mock.method(eSessions,'control', async (...args)=> { received=args;return {id:'action',state:'dispatched'}; });
 const url=`/workspaces/${w.id}/nodes/n/messages`;
 assert.equal((await request(url,'POST',{content:'hello'})).status,400);
 const res=await request(url,'POST',{intentId:'intent-1',content:'hello'});
 assert.equal(res.status,202); assert.equal((await res.json()).action.state,'dispatched'); assert.equal(received[3].intentId,'intent-1');
 assert.equal((await request(`/workspaces/${w.id}/nodes/other/messages`,'POST',{intentId:'x',content:'y'})).status,404);
});
test('layout changes are validated atomically', async () => {
 const w=await make(), store=getGraphStore(w.id);store.upsertNode({id:'n',x:1,y:2});
 assert.equal((await request(`/workspaces/${w.id}/layout`,'PATCH',{positions:[{id:'n',x:5,y:6},{id:'missing',x:0,y:0}]})).status,400);
 assert.equal(store.getNode('n').x,1);
 assert.equal((await request(`/workspaces/${w.id}/layout`,'PATCH',{positions:[{id:'n',x:5,y:6}]})).status,200);
 assert.equal(store.getNode('n').x,5);
});
test('HTTP and WS boundary rejects hostile origin and Host', () => {
 const port=process.env.PORT||3000,ui=process.env.CANVAS_UI_PORT||5173;
 assert.equal(localRequestAllowed(`127.0.0.1:${port}`,`http://127.0.0.1:${ui}`),true);
 assert.equal(localRequestAllowed(`evil.test:${port}`,`http://127.0.0.1:${ui}`),false);
 assert.equal(localRequestAllowed(`127.0.0.1:${port}`,'https://evil.test'),false);
 assert.equal(localRequestAllowed(`127.0.0.1:${port}`,'null'),false);
});

test('MVP archive is non-destructive and blocks writes until restored', async () => {
 const w=await make();
 assert.equal((await request(`/workspaces/${w.id}`,'PATCH',{title:'Renamed'})).status,200);
 assert.equal(registry.get(w.id).title,'Renamed');
 assert.equal((await request(`/workspaces/${w.id}`,'PATCH',{archived:true})).status,200);
 assert.ok(registry.get(w.id).archivedAt);
 assert.equal((await request('/workspaces')).status,200);
 assert.equal((await (await request('/workspaces')).json()).workspaces.some(x=>x.id===w.id),false);
 assert.equal((await (await request('/workspaces?view=archived')).json()).workspaces.some(x=>x.id===w.id),true);
 assert.equal((await request(`/workspaces/${w.id}/sessions`,'POST',{})).status,409);
 assert.equal((await request(`/workspaces/${w.id}`,'PATCH',{archived:false})).status,200);
 assert.equal(registry.get(w.id).archivedAt,undefined);
});

test('e MVP workspace listing excludes demo templates by default',async()=>{const prior=process.env.CANVAS_BACKEND;process.env.CANVAS_BACKEND='e';try{const live=await(await request('/workspaces')).json();assert.ok(live.workspaces.every(w=>w.backend==='e'));const demo=await(await request('/workspaces?view=examples')).json();assert.ok(demo.workspaces.length>0);assert.ok(demo.workspaces.every(w=>w.source==='demo'));}finally{if(prior===undefined)delete process.env.CANVAS_BACKEND;else process.env.CANVAS_BACKEND=prior;}});

test('approval mode rejects old auto, missing consent and implicit reviewer',async t=>{const w=await make();t.mock.method(eSessions,'get',()=>({workspaceId:w.id,nodeId:'n',lifecycle:'ready'}));t.mock.method(eSessions,'setApprovalMode',(_w,_n,mode)=>({approvalMode:mode}));const url=`/workspaces/${w.id}/nodes/n/approval-mode`;assert.equal((await request(url,'PATCH',{mode:'auto',confirmRisk:true})).status,400);assert.equal((await request(url,'PATCH',{mode:'full'})).status,400);assert.equal((await request(url,'PATCH',{mode:'assisted'})).status,400);assert.equal((await request(url,'PATCH',{mode:'manual'})).status,200);assert.equal((await request(url,'PATCH',{mode:'full',confirmRisk:true})).status,200);});

test('event history, broadcasts and rates isolate equal node IDs by workspace', async () => {
 const a=await make(), b=await make(), receivedA=[], receivedB=[];
 const wa={send:data=>receivedA.push(JSON.parse(data))}, wb={send:data=>receivedB.push(JSON.parse(data))};
 for(const [workspace, socket] of [[a,wa],[b,wb]]) {
  getGraphStore(workspace.id).upsertNode({id:'same',title:'same',type:'chat',status:'queued',x:0,y:0});
  wsHandlers.onOpen(null,socket);
  wsHandlers.onMessage({data:JSON.stringify({type:'hello',workspaceId:workspace.id})},socket);
 }
 try {
  eventbus.append({workspaceId:a.id,nodeId:'same',kind:'message',text:'only A'});
  eventbus.append({workspaceId:b.id,nodeId:'same',kind:'message',text:'only B'});
  eventbus.append({workspaceId:a.id,kind:'lifecycle',text:'A lifecycle'});
  for(const [workspace, label] of [[a,'only A'],[b,'only B']]) {
   const events=await (await request(`/workspaces/${workspace.id}/nodes/same/events`)).json();
   assert.deepEqual(events.map(e=>e.text),[label]);
   registry.setActive(workspace.id);
   assert.deepEqual((await (await request('/nodes/same/events')).json()).map(e=>e.text),[label]);
   assert.equal(eventbus.ratePerMinute(workspace.id,['same']),1);
  }
  assert.deepEqual(receivedA.filter(m=>m.type==='event').map(m=>m.event.text),['only A','A lifecycle']);
  assert.deepEqual(receivedB.filter(m=>m.type==='event').map(m=>m.event.text),['only B']);
 } finally { wsHandlers.onClose(null,wa);wsHandlers.onClose(null,wb); }
});

test('session archive list is separate and delete requires archived confirmation plus graph removal',async t=>{
 const w=await make(),store=getGraphStore(w.id);store.upsertNode({id:'n-old',title:'Old session',type:'chat',status:'waiting',harness:'pi',env:'e',agentId:'as:old',x:0,y:0});store.upsertEdge({id:'e-old',source:'n-old',target:'other',kind:'communication'});
 const archived={workspaceId:w.id,nodeId:'n-old',title:'Old session',lifecycle:'stopped',archivedAt:'2026-01-01T00:00:00Z',version:1,updatedAt:'2026-01-01T00:00:00Z',ref:{agentSessionId:'as:old',nativeSessionId:'native:old',cwd:'/fixture'}};
 t.mock.method(eSessions,'get',(wid,nid)=>wid===w.id&&nid==='n-old'?archived:undefined);t.mock.method(eSessions,'list',wid=>wid===w.id?[archived]:[]);
 const archive=t.mock.method(eSessions,'archive',async()=>archived),remove=t.mock.method(eSessions,'deleteArchived',()=>{});
 assert.equal((await request(`/workspaces/${w.id}/sessions`)).status,400);
 const listed=await (await request(`/workspaces/${w.id}/sessions?view=archived`)).json();assert.equal(listed.sessions.length,1);assert.equal(listed.sessions[0].nodeId,'n-old');
 assert.equal((await request(`/workspaces/${w.id}/nodes/n-old/archive`,'POST')).status,200);assert.equal(archive.mock.calls.length,1);
 assert.equal((await request(`/workspaces/${w.id}/nodes/n-old/session`,'DELETE')).status,400);assert.equal(remove.mock.calls.length,0);
 assert.equal((await request(`/workspaces/${w.id}/nodes/n-old/session`,'DELETE',{confirmDelete:true})).status,200);assert.equal(remove.mock.calls.length,1);assert.equal(store.getNode('n-old'),undefined);assert.equal(store.graph.edges.some(e=>e.source==='n-old'||e.target==='n-old'),false);
});

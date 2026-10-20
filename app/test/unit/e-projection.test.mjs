import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSession } from '../../api/e/projection.ts';
import { computeLayout } from '../../api/layout.ts';
import { capabilityAvailable } from '../../api/e/contracts.ts';
const view = { workspaceId: 'w', nodeId: 'n', title: 'Pi', lifecycle: 'ready', version: 1, updatedAt: new Date().toISOString(), ref: { agentSessionId: 'as:a', nativeSessionId: 'native:a', cwd: '/project', model: 'real-model' }, snapshot: { id: 'as:a', nativeSessionId: 'native:a', epoch: 'a', revision: 1, seq: 1, nextSeq: 2, status: 'idle', runs: [], messages: [{ id: 'm', role: 'assistant', order: 0, state: 'completed', blocks: [{ type: 'text', text: 'hello' }, { type: 'unknown', native: 'data' }] }], tools: [], pendingActions: [], degradedReasons: [], capabilities: [] } };
test('session projection retains identities, does not guess completion or failure', () => {
  const node = projectSession(view);
  assert.equal(node.summary, 'hello'); assert.equal(node.sessionRef.nativeSessionId, 'native:a');
  assert.equal(node.paneId, undefined); assert.equal(node.sessionStatus, 'idle');
  assert.notEqual(node.status, 'completed');
  assert.notEqual(projectSession({ ...view, lifecycle: 'stopped', snapshot: { ...view.snapshot, status: 'exited' } }).status, 'failed');
});
test('stream updates preserve layout and do not store full message history in graph', () => {
 const node = projectSession(view, { x: 123, y: -45, zoneId: 'zone' });
 assert.equal(node.x, 123); assert.equal(node.y, -45); assert.equal(node.zoneId, 'zone'); assert.equal(node.messages, undefined);
});
test('only authoritative, live, unexpired capability enables controls', () => {
 const capable = { ...view, snapshot: { ...view.snapshot, capabilities: [{ name: 'abort', available: true, authority: 'authoritative', expiresAt: '2030-01-01T00:00:00Z' }] } };
 assert.equal(capabilityAvailable(capable, 'abort', Date.parse('2029-01-01')), true);
 assert.equal(capabilityAvailable(capable, 'abort', Date.parse('2031-01-01')), false);
 assert.equal(capabilityAvailable({ ...capable, lifecycle: 'interrupted' }, 'abort', 0), false);
 capable.snapshot.capabilities[0].authority = 'advisory'; assert.equal(capabilityAvailable(capable, 'abort', 0), false);
});

test('archived session projects archived marker and is excluded from auto layout',()=>{
 const view={workspaceId:'w',nodeId:'n-old',title:'Old',lifecycle:'stopped',archivedAt:'2026-01-01',updatedAt:'2026-01-01',version:1,ref:{agentSessionId:'as:old',nativeSessionId:'native:old',cwd:'/fixture'}};
 const node=projectSession(view);assert.equal(node.archivedAt,'2026-01-01');
 const layout=computeLayout({nodes:[node,{id:'n-live',type:'chat',title:'Live',status:'waiting',harness:'pi',env:'e',agentId:'as:live',x:0,y:0}],edges:[],zones:[],runState:'idle'});
 assert.deepEqual(layout.positions.map(p=>p.id),['n-live']);
 Object.assign(node,projectSession({...view,archivedAt:undefined,lifecycle:'ready'},node));
 assert.equal(node.archivedAt,undefined,'restoration clears the marker even in a merged graph node');
 assert.equal(JSON.parse(JSON.stringify(node)).archivedAt,undefined);
});

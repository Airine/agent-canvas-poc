import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coordinator-test-'));
process.env.CANVAS_DATA_DIR = dir;
process.env.CANVAS_EVENTS_LOG = path.join(dir, 'events.jsonl');
const { coordinator } = await import('../../api/coordinator.ts');
const { GraphStore } = await import('../../api/graph.ts');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

for (const event of ['pane.exited','pane.closed']) test(`${event} without marker activates error handler and completes graph`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const node = (id, status, extra={}) => ({ id, type:'operation', title:id, status, x:0, y:0, ...extra });
  const store = new GraphStore('fixture', { nodes:[node('work','running',{paneId:'pane'}),node('handler','queued')], edges:[{id:'error',source:'work',target:'handler',kind:'error'}], zones:[], runState:'running' });
  const ctx = { wsId:'fixture', runDir:dir, handled:new Set(), starting:new Set(), mock:true };
  // Call the callback used by the subscription, without connecting to herdr.
  coordinator.handlePaneEvent(ctx, store, { event, data:{pane_id:'pane'} });
  assert.equal(store.getNode('work').status,'failed');
  assert.equal(store.getNode('handler').status,'running');
  assert.equal(store.graph.edges[0].label,'error routed');
  coordinator.handlePaneEvent(ctx, store, { event, data:{pane_id:'pane'} });
  t.mock.timers.tick(800);
  assert.equal(store.getNode('handler').status,'completed');
  assert.equal(store.graph.runState,'done');
});

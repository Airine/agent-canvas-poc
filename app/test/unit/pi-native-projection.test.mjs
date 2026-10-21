import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPiMessages } from '../../native/pi-projection.ts';
const message = (id, role, order, createdAt, content) => ({id, role, order, createdAt, state: 'completed', blocks: [{type: 'text', text: content}]});
test('native projection preserves cross-run chronology, including restored history', () => {
  const view = {snapshot: {messages: [
    message('u1','user',0,'2026-01-01T00:00:01Z','one'),
    message('u2','user',0,'2026-01-01T00:00:03Z','two'),
    message('a1','assistant',1,'2026-01-01T00:00:02Z','first'),
    message('a2','assistant',1,'2026-01-01T00:00:04Z','second'),
    message('empty','system',0,'2026-01-01T00:00:00Z',''),
  ], tools: []}};
  const prior = JSON.stringify(view);
  assert.deepEqual(projectPiMessages(view).map(m => m.id), ['u1','a1','u2','a2']);
  assert.equal(JSON.stringify(view), prior);
});
test('native projection renders normalized tools exactly once and retains failures', () => {
  const view = {snapshot: {messages: [
    message('u','user',0,'2026-01-01T00:00:00Z','run'),
    message('a','assistant',1,'2026-01-01T00:00:01Z','checking'),
    message('r','tool',2,'2026-01-01T00:00:02Z','duplicate'),
    {...message('error','assistant',3,'2026-01-01T00:00:03Z',''), error: 'model unavailable'},
  ], tools: [{id:'t', name:'bash', state:'rejected', parentMessageId:'a', arguments:{command:'printf TEST'}, result:'denied'}]}};
  const rows = projectPiMessages(view);
  assert.deepEqual(rows.map(r=>r.id), ['u','a','tool:t','error']);
  assert.equal(rows[2].toolStatus, 'denied');
  assert.deepEqual(rows[2].toolArgs, {command:'printf TEST'});
  assert.equal(rows[3].status, 'error');
  assert.equal(rows[3].content, 'model unavailable');
});

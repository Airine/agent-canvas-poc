import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../../api/layout.ts';
test('native cards do not overlap after auto layout', () => {
  const nodes = ['a','b','c'].map(id=>({id, backend:'e', type:'chat', x:0,y:0}));
  const positions = computeLayout({nodes,edges:[{id:'ab',source:'a',target:'b',kind:'strong'}],zones:[],runState:'idle'}).positions;
  const a = positions.find(p=>p.id==='a'), b = positions.find(p=>p.id==='b'), c = positions.find(p=>p.id==='c');
  assert.ok(b.x-a.x>=600);
  assert.ok(Math.abs(c.y-a.y)>=620);
});

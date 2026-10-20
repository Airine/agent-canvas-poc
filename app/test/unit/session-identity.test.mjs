import test from 'node:test';
import assert from 'node:assert/strict';
import { identityHash, sessionIdentities } from '../../src/pages/canvas/session-identity.ts';
const peer = (nodeId, title = 'Agent', workspaceId = 'canvas') => ({ nodeId, title, workspaceId });

test('unique nicknames have no suffix; duplicates are scoped to one Canvas', () => {
  const result = sessionIdentities([peer('a', 'Writer'), peer('b', 'Writer', 'elsewhere'), peer('c', 'Reader')], 'canvas');
  assert.equal(result.get('a').displayTitle, 'Writer');
  assert.equal(result.get('c').suffix, '');
  assert.equal(result.has('b'), false);
});

test('duplicates get stable @hash suffixes, independent of order and nickname', () => {
  const sources = [peer('a'), peer('b'), peer('c', 'Unique')];
  const first = sessionIdentities(sources, 'canvas');
  const reordered = sessionIdentities([...sources].reverse(), 'canvas');
  const renamed = sessionIdentities(sources.map(source => ({ ...source, title: 'New nickname' })), 'canvas');
  assert.match(first.get('a').suffix, /^@[0-9a-f]{6,8}$/);
  assert.notEqual(first.get('a').suffix, first.get('b').suffix);
  for (const id of ['a', 'b']) {
    assert.deepEqual(first.get(id), reordered.get(id));
    assert.equal(first.get(id).suffix, renamed.get(id).suffix);
  }
  assert.equal(first.get('c').suffix, '');
});

test('renaming out of a duplicate group removes both suffixes; whitespace/NFC normalize', () => {
  const before = sessionIdentities([peer('a', ' Café '), peer('b', 'Cafe\u0301')], 'canvas');
  assert.ok(before.get('a').suffix);
  const after = sessionIdentities([peer('a', 'Café'), peer('b', 'Writer')], 'canvas');
  assert.equal(after.get('a').suffix, '');
  assert.equal(after.get('b').suffix, '');
  assert.equal(sessionIdentities([peer('a', '  ')], 'canvas').get('a').nickname, 'Agent');
});

test('prefix collisions extend deterministically instead of relying on array order', () => {
  const sources = [peer('a'), peer('b')];
  const hash = key => JSON.parse(key)[1] === 'a' ? '123456aa' : '123456ab';
  const result = sessionIdentities(sources, 'canvas', hash);
  assert.equal(result.get('a').suffix, '@123456aa');
  assert.equal(result.get('b').suffix, '@123456ab');
  assert.deepEqual([...result].sort(), [...sessionIdentities([...sources].reverse(), 'canvas', hash)].sort());
});

test('full hash collisions have injective, stable fallback even after insertion', () => {
  const sources = [peer('a'), peer('b'), peer('😀')];
  const hash = () => 'deadbeef';
  const result = sessionIdentities(sources, 'canvas', hash);
  assert.equal(new Set([...result.values()].map(value => value.suffix)).size, sources.length);
  const inserted = sessionIdentities([peer('earlier'), ...sources].reverse(), 'canvas', hash);
  for (const source of sources) assert.equal(result.get(source.nodeId).suffix, inserted.get(source.nodeId).suffix);
  assert.match(result.get('a').suffix, /^@deadbeef-/);
});

test('hashes do not leak native session identifiers and are deterministic', () => {
  assert.equal(identityHash('stable-id'), identityHash('stable-id'));
  assert.notEqual(identityHash('stable-id'), identityHash('other-id'));
  assert.match(identityHash('中文😀'), /^[0-9a-f]{8}$/);
});

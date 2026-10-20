import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileUnusedReview } from './unused-review.mjs';

const record = (file, decision) => ({ file, decision, sha256: 'original' });
test('review distinguishes deletion, protected work and its dependency closure', () => {
  const rows = [record('gone', 'remove'), record('draft', 'retain-uncommitted'), record('helper', 'retain-dependency')];
  const result = reconcileUnusedReview(rows, new Set(['draft', 'helper']), file => file === 'gone' ? undefined : 'original');
  assert.deepEqual(result.map(r => r.status), ['removed', 'retain-uncommitted', 'retain-dependency']);
});
test('changed, missing or restored files invalidate historical decisions', () => {
  for (const hash of [undefined, 'edited']) {
    assert.equal(reconcileUnusedReview([record('draft', 'retain-uncommitted')], new Set(['draft']), () => hash)[0].status, 'changed');
  }
  assert.equal(reconcileUnusedReview([record('gone', 'remove')], new Set(), () => 'original')[0].status, 'changed');
});
test('new consumers and malformed ledgers are not silently treated as unused exemptions', () => {
  assert.equal(reconcileUnusedReview([record('draft', 'retain-uncommitted')], new Set(), () => 'original')[0].status, 'now-referenced');
  assert.throws(() => reconcileUnusedReview([record('a', 'remove'), record('a', 'remove')], new Set(), () => undefined), /Invalid/);
  assert.throws(() => reconcileUnusedReview([record('a', 'ignore')], new Set(), () => undefined), /Invalid/);
});

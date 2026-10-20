import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { migrateLegacySeedPath, PROJECT_ROOT, resolveSeedPath } from '../../api/workspace-paths.ts';

const root = path.resolve('/local/checkouts/canvas');
const legacy = [
  { id: 'ws-demo', title: 'Demo · 发布流水线', path: 'C:/projects/agent-canvas' },
  { id: 'ws-etl', title: 'Nightly ETL · 数据管道', path: 'C:/projects/nightly-etl' },
  { id: 'ws-research', title: '竞品调研 · 双 Agent 并行', path: 'C:/projects/agent-canvas' },
];

test('seed paths resolve from checkout, independently of process cwd', () => {
  assert.equal(PROJECT_ROOT, path.resolve(process.env.CANVAS_PROJECT_ROOT || fileURLToPath(new URL('../../../', import.meta.url))));
  assert.equal(resolveSeedPath('.', root), root);
  assert.equal(resolveSeedPath('examples', root), path.join(root, 'examples'));
});

test('only exact legacy seeds migrate, without mutating input records', () => {
  for (const record of legacy) {
    const before = structuredClone(record);
    assert.equal(migrateLegacySeedPath(record, root), root);
    assert.deepEqual(record, before);
    assert.equal(migrateLegacySeedPath({ ...record, path: root }, root), root);
  }
});

test('custom workspaces and edited seed paths are preserved', () => {
  for (const record of [
    { ...legacy[0], id: 'ws-user' },
    { ...legacy[0], title: 'My workspace' },
    { ...legacy[0], path: 'D:/real-project' },
    { ...legacy[0], path: '/home/user/custom-project' },
    { ...legacy[0], path: '' },
  ]) assert.equal(migrateLegacySeedPath(record, root), record.path);
});

test('shipped templates use real checkout-relative paths', () => {
  for (const file of ['demo-release-pipeline', 'etl-nightly', 'research-sprint']) {
    const seed = JSON.parse(readFileSync(new URL(`../../api/graphs/${file}.json`, import.meta.url), 'utf8'));
    assert.equal(seed.path, '.');
    assert.equal(resolveSeedPath(seed.path, root), root);
  }
});

test('offline fallback does not claim a machine-specific filesystem path', () => {
  const source = readFileSync(new URL('../../src/pages/canvas/mock-server.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /C:\/work|C:\/projects/);
  assert.equal((source.match(/path: '离线示例 · 未连接本地目录'/g) || []).length, 3);
});

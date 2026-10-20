import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'canvas-wiki-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  writeFileSync(path.join(root, 'source.ts'), 'export const example = 1;\n');
  git('add', 'source.ts');
  git('-c', 'user.name=Wiki Test', '-c', 'user.email=wiki-test@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'fixture');
  const dir = path.join(root, 'docs/architecture');
  mkdirSync(path.join(dir, 'wiki'), { recursive: true });
  copyFileSync(path.resolve(import.meta.dirname, '../../docs/architecture/verify.mjs'), path.join(dir, 'verify.mjs'));
  writeFileSync(path.join(dir, 'wiki/index.md'), `---\nbaseline: ${git('rev-parse', 'HEAD')}\n---\n# Index\n[Module](module.md)\n`);
  writeFileSync(path.join(dir, 'wiki/module.md'), `---\nsources:\n  - source.ts ${git('hash-object', 'source.ts').slice(0, 12)} example\ncovers:\n  - source.ts\n---\n# Module\n`);
  const run = (...args) => spawnSync(process.execPath, [path.join(dir, 'verify.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  const digest = run('--digest').stdout.trim();
  writeFileSync(path.join(dir, 'architecture.html'), `<meta name="wiki-digest" content="${digest}">`);
  return { root, dir, run };
}

test('verifier accepts matching evidence and links', t => {
  const f = fixture(t); assert.equal(f.run().status, 0);
});
test('verifier rejects changed source without automatically syncing', t => {
  const f = fixture(t); writeFileSync(path.join(f.root, 'source.ts'), 'export const example = 2;\n');
  const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /source changed/);
});
test('coverage ledger includes non-ignored untracked work', t => {
  const f = fixture(t); writeFileSync(path.join(f.root, 'new.ts'), 'export const added = true;\n');
  const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /new\.ts/);
});
test('coverage ledger accepts a reviewed move without staging user changes', t => {
  const f = fixture(t), source = path.join(f.root, 'source.ts');
  writeFileSync(path.join(f.root, 'moved.ts'), readFileSync(source));
  rmSync(source);
  const page = path.join(f.dir, 'wiki/module.md');
  writeFileSync(page, readFileSync(page, 'utf8').replaceAll('source.ts', 'moved.ts'));
  assert.equal(f.run().status, 0);
});
test('verifier rejects broken links and stale rendered prose', t => {
  const f = fixture(t), file = path.join(f.dir, 'wiki/module.md');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n[Broken](missing.md)\n');
  const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /broken link/); assert.match(result.stderr, /stale \(digest/);
});

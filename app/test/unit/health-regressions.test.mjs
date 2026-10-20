import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { approvalRule } from '../../api/e/approval-rules.ts';
import { emptyQueue, mutateQueue } from '../../api/e/message-queue.ts';
import { shellQuote, exitWrapper } from '../../api/shell.ts';
import { readAttachment } from '../../src/pages/canvas/chat/attachments.ts';

function directory(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'canvas regression ')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('assisted approval denies intermediate, final and dangling symlinks for write/edit', t => {
  const dir = directory(t);
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git/config'), 'old value');
  fs.symlinkSync('.git', path.join(dir, 'public'));
  fs.symlinkSync('.git/config', path.join(dir, 'alias.txt'));
  fs.symlinkSync('.git/missing', path.join(dir, 'dangling.txt'));
  for (const target of ['public/config', 'public/new.txt', 'alias.txt', 'dangling.txt', 'public/../new.txt']) {
    for (const tool of ['write', 'edit']) {
      const args = tool === 'write' ? { path: target, content: 'hello' } : { path: target, oldText: 'old', newText: 'new' };
      assert.equal(approvalRule({ complete: true, tool, args }, dir).route, 'manual', `${tool} ${target}`);
    }
  }
  fs.mkdirSync(path.join(dir, 'safe'));
  assert.equal(approvalRule({ complete: true, tool: 'write', args: { path: 'safe/new.txt', content: 'hello' } }, dir).route, 'review');
});

test('queue add/edit enforce final byte capacity atomically and preserve in-flight references', () => {
  const q = emptyQueue();
  const mutate = input => mutateQueue(q, { expectedRevision: q.revision, ...input });
  for (let i = 0; i < 4; i++) mutate({ operation: 'add', itemId: `q${i}`, content: 'small' });
  const bytes = Buffer.alloc(2 * 1024 * 1024);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const attachments = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, name: 'large.png', mimeType: 'image/png', data: bytes.toString('base64') }));
  for (let i = 0; i < 2; i++) mutate({ operation: 'edit', itemId: `q${i}`, content: 'large', attachments });
  const before = JSON.stringify(q), original = q.items[2];
  for (const operation of ['edit', 'add']) {
    assert.throws(() => mutate({ operation, itemId: operation === 'edit' ? 'q2' : 'extra', content: 'large', attachments, authorize: true }), /32 MiB/);
    assert.equal(JSON.stringify(q), before);
    assert.equal(q.items[2], original);
  }
  q.items[0].state = 'submitted';
  const inFlight = q.items[0];
  mutate({ operation: 'edit', itemId: 'q2', content: 'valid edit' });
  assert.equal(q.items[0], inFlight);
  mutate({ operation: 'resume', authorize: true });
  assert.equal(q.reason, undefined);
});

test('known text MIME types normalize but binary MIME cannot masquerade as markdown', async () => {
  for (const type of ['', 'text/plain', 'text/markdown', 'text/x-markdown', 'text/csv', 'text/csv;charset=utf-8']) {
    const attachment = await readAttachment(new File(['中文'], 'notes.md', { type }));
    assert.equal(attachment.mimeType, 'text/plain');
    assert.equal(Buffer.from(attachment.data, 'base64').toString(), '中文');
  }
  await assert.rejects(readAttachment(new File(['binary'], 'notes.md', { type: 'application/octet-stream' })), /UTF-8/);
});

test('shell wrapper preserves spaces, quotes and metacharacters and captures nonzero exit', t => {
  const root = directory(t), dir = path.join(root, "path ' $(touch INJECTED)");
  fs.mkdirSync(dir);
  const script = path.join(dir, 'node script.sh'), exit = path.join(dir, 'node exit');
  const arg = "node ' ; touch INJECTED";
  fs.writeFileSync(script, 'printf "%s" "$1" > "$CANVAS_RUN_DIR/argument"; exit 7\n');
  execFileSync('bash', ['-c', exitWrapper(`CANVAS_RUN_DIR=${shellQuote(dir)} bash ${shellQuote(script)} ${shellQuote(arg)}`, exit)], { cwd: root });
  assert.equal(fs.readFileSync(exit, 'utf8'), '7');
  assert.equal(fs.readFileSync(path.join(dir, 'argument'), 'utf8'), arg);
  assert.equal(fs.existsSync(path.join(root, 'INJECTED')), false);
});

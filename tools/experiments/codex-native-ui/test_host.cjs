const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('host preserves message order while an earlier HTTP request is pending', async () => {
  const sent = [];
  const polls = [];
  let release;
  const window = { addEventListener() {}, postMessage() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'host.js'), 'utf8'), {
    __PROBE_TOKEN__: 'test', __PROBE_CURSOR__: 42, window, console,
    document: { createElement: () => ({}), head: { append() {} } },
    location: { origin: 'http://127.0.0.1:4392' },
    fetch: (url, options) => {
      if (url.startsWith('/events')) {
        polls.push(url);
        return new Promise(() => {});
      }
      sent.push(JSON.parse(options.body));
      if (sent.length === 1) return new Promise(resolve => { release = resolve; });
      return Promise.resolve({ ok: true });
    },
  });
  const api = window.acquireVsCodeApi();
  assert.deepEqual(polls, ['/events?after=42']);
  api.postMessage({ type: 'vscode-capn-rpc-message', message: ['push'] });
  api.postMessage({ type: 'vscode-capn-rpc-message', message: ['pull', 1] });
  api.postMessage({ type: 'thread-prewarm-start', request: { method: 'thread/start' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 1);
  release({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent.map(message => message.type), [
    'vscode-capn-rpc-message', 'vscode-capn-rpc-message', 'mcp-request',
  ]);
  assert.deepEqual(sent[1].message, ['pull', 1]);
  assert.equal(sent[2].probeOriginalType, 'thread-prewarm-start');
});

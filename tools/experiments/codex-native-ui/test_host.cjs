const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function transportHarness(fetch) {
  const replies = [], timers = [], dialogs = [];
  const window = { addEventListener() {}, postMessage(value) { replies.push(value); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'host.js'), 'utf8'), {
    __PROBE_TOKEN__: 'test', __PROBE_CURSOR__: 42, window,
    console: { error() {} }, setTimeout(fn) { timers.push(fn); },
    document: { getElementById() { return null; }, createElement() { return {style:{},setAttribute() {},append(...children) {this.children=children;},showModal() {dialogs.push(this);},close() {},remove() {}}; }, head:{append() {}},body:{append() {}} },
    location:{origin:'http://localhost'}, fetch,
  });
  return {api:window.acquireVsCodeApi(),replies,timers,dialogs};
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('HTTP and network failures settle RPC/fetch requests without replaying actions', async () => {
  let posts = 0;
  const h = transportHarness(url => {
    if (url.startsWith('/events')) return new Promise(() => {});
    if (++posts === 1) return Promise.resolve({ok:false,status:503,json:async () => ({error:'offline'})});
    return Promise.reject(new Error('network lost'));
  });
  h.api.postMessage({type:'mcp-request',request:{id:'rpc',method:'thread/list'}});
  h.api.postMessage({type:'fetch',requestId:'fetch',url:'vscode://codex/test'});
  await tick();
  assert.equal(posts,2);
  assert.equal(h.replies[0].message.id,'rpc');
  assert.match(h.replies[0].message.error.message,/503/);
  assert.equal(h.replies[1].requestId,'fetch');
  assert.match(h.replies[1].error,/outcome is unknown/);
});

test('temporary event failure blocks actions then resumes from the same cursor', async () => {
  const polls = []; let posts = 0;
  const h = transportHarness(url => {
    if (!url.startsWith('/events')) { posts++; return Promise.resolve({ok:true}); }
    polls.push(url);
    if (polls.length === 1) return Promise.reject(new Error('offline'));
    if (polls.length === 2) return Promise.resolve({ok:true,json:async () => ({messages:[],cursor:43})});
    return new Promise(() => {});
  });
  await tick();
  h.api.postMessage({type:'mcp-request',request:{id:1,method:'turn/start'}});
  await tick(); assert.equal(posts,0); assert.match(h.replies[0].message.error.message,/not submitted/);
  h.timers.shift()(); await tick();
  assert.deepEqual(polls,['/events?after=42','/events?after=42','/events?after=43']);
  h.api.postMessage({type:'mcp-request',request:{id:2,method:'thread/list'}});
  await tick(); assert.equal(posts,1);
});

test('expired event lease never retries or submits another action', async () => {
  let calls = 0;
  const h = transportHarness(async () => { calls++; return {ok:false,status:403}; });
  await tick(); h.api.postMessage({type:'mcp-request',request:{id:3,method:'thread/list'}});
  await tick(); assert.equal(calls,1); assert.equal(h.timers.length,0); assert.equal(h.replies[0].message.id,3);
});

test('disconnect during permission confirmation prevents grant and turn submission', async () => {
  let disconnect, posts = 0;
  const h = transportHarness(url => {
    if (url.startsWith('/events')) return new Promise((resolve,reject) => {disconnect=reject;});
    posts++; return Promise.resolve({ok:true});
  });
  h.api.postMessage({type:'mcp-request',request:{id:4,method:'turn/start',params:{threadId:'owned',sandboxPolicy:{type:'workspaceWrite'}}}});
  await tick(); assert.equal(h.dialogs.length,1);
  disconnect(new Error('offline')); await tick();
  h.dialogs[0].children[2].onclick(); await tick();
  assert.equal(posts,0); assert.equal(h.replies[0].message.id,4);
  assert.match(h.replies[0].message.error.message,/not submitted/);
});

test('official permission preference gates nullable requests behind confirmation', async () => {
  const sent = [], replies = [], dialogs = [];
  const window = { addEventListener() {}, postMessage(value) { replies.push(value); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'host.js'), 'utf8'), {
    __PROBE_TOKEN__: 'test', __PROBE_CURSOR__: 0, window, console,
    document: {
      createElement(tag) { return { style: {}, append(...children) { this.children = children; },
        showModal() { dialogs.push(this); }, close() {}, remove() {} }; },
      head: { append() {} }, body: { append() {} },
    },
    location: { origin: 'http://localhost' },
    fetch(url, options) {
      if (url.startsWith('/events')) return new Promise(() => {});
      sent.push(JSON.parse(options.body)); return Promise.resolve({ok:true});
    },
  });
  const api = window.acquireVsCodeApi();
  api.postMessage({type:'persisted-atom-update',key:'permission-selection-by-host-id:local',value:{kind:'agent-mode',agentMode:'auto'}});
  const request = {type:'mcp-request',request:{id:'one',method:'turn/start',params:{threadId:'owned',sandboxPolicy:null}}};
  api.postMessage(request);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.equal(dialogs.length, 1);
  dialogs[0].children[1].onclick(); // Cancel never forwards the turn.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.match(replies[0].message.error.message, /cancelled/);
  api.postMessage(request);
  await new Promise(resolve => setImmediate(resolve));
  dialogs[1].children[2].onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[1].type, 'canvas-confirm-permissions');
  assert.equal(sent[1].policy, 'workspaceWrite');
  assert.equal(sent[2].request.method, 'turn/start');
});

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

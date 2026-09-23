// WS term-stream test: subscribe n-transform during a ws-etl run, verify
// 2Hz snapshot pushes arrive with growing script output, then finish + reset.
import WebSocket from 'ws';

const BASE = 'http://localhost:3000';
const WSURL = 'ws://localhost:3000/ws';
const WID = 'ws-etl';
const NODE = 'n-transform';

const post = (p, body) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const ws = new WebSocket(WSURL);
const terms = [];
let done = false;

ws.on('open', async () => {
  ws.send(JSON.stringify({ type: 'hello', workspaceId: WID }));
  ws.send(JSON.stringify({ type: 'term.subscribe', workspaceId: WID, nodeId: NODE }));
  console.log('run:', await post(`/api/workspaces/${WID}/run`));
});

ws.on('message', async (data) => {
  const m = JSON.parse(data.toString());
  if (m.type === 'term') {
    terms.push({ t: Date.now(), len: m.ansi.length, tail: m.ansi.slice(-90).replace(/\n/g, '\\n') });
    if (terms.length <= 6) console.log(`term #${terms.length} len=${m.ansi.length} tail=...${m.ansi.slice(-60).replace(/\n/g, ' | ')}`);
  } else if (m.type === 'node' && m.workspaceId === WID) {
    if (m.node.id === 'n-load' && m.node.status === 'waiting') {
      console.log('approving n-load:', await post(`/api/workspaces/${WID}/nodes/n-load/approval`, { decision: 'approved' }));
    }
  } else if (m.type === 'graph' && m.workspaceId === WID && m.graph.runState === 'done') {
    done = true;
    ws.close();
  }
});

ws.on('close', async () => {
  console.log(`== term pushes: ${terms.length} over ${((terms.at(-1)?.t - terms[0]?.t) / 1000).toFixed(1)}s ==`);
  const gaps = terms.slice(1).map((m, i) => m.t - terms[i].t);
  console.log('push intervals (ms):', gaps.join(','));
  const last = terms.at(-1);
  console.log('last snapshot tail:', last?.tail);
  console.log('reset:', await post(`/api/workspaces/${WID}/reset`));
  process.exit(0);
});

setTimeout(() => {
  if (!done) {
    console.log('TIMEOUT; term pushes so far:', terms.length);
    process.exit(1);
  }
}, 60000);

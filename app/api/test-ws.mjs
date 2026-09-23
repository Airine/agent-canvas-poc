// WS self-test: hello with explicit workspaceId, then hello without (active).
import WebSocket from 'ws';

const target = process.argv[2] || 'ws-research';

function helloOnce(msg, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3000/ws');
    const timer = setTimeout(() => reject(new Error(`${label}: timeout`)), 5000);
    ws.on('open', () => ws.send(JSON.stringify(msg)));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      clearTimeout(timer);
      console.log(
        `${label}: type=${m.type} workspaceId=${m.workspaceId} zones=${JSON.stringify((m.graph?.zones ?? []).map((z) => z.title))} nodes=${m.graph?.nodes?.length} edges=${m.graph?.edges?.length}`,
      );
      ws.close();
      resolve(m);
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

const m1 = await helloOnce({ type: 'hello', workspaceId: target }, 'hello(ws-research)');
if (m1.workspaceId !== target) throw new Error('wrong workspaceId echoed');
if (!m1.graph.zones?.length) throw new Error('zones missing');
await helloOnce({ type: 'hello' }, 'hello(active)');
console.log('WS TEST OK');
process.exit(0);

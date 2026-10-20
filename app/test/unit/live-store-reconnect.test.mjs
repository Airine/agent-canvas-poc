import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveStore } from '../../src/pages/canvas/live-store.ts';

test('terminal subscriptions survive reconnect and hello resync without remounting', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sockets = [];
  class Socket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor() { sockets.push(this); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; this.onclose?.(); }
    receive(message) { this.onmessage({ data: JSON.stringify({ workspaceId: 'w', ...message }) }); }
  }
  const priorWS = globalThis.WebSocket, priorLocation = globalThis.location;
  globalThis.WebSocket = Socket;
  globalThis.location = { protocol: 'http:', host: 'fixture', search: '' };
  t.after(() => { globalThis.WebSocket = priorWS; if (priorLocation === undefined) delete globalThis.location; else globalThis.location = priorLocation; });
  const store = new LiveStore('w');
  t.after(() => store.dispose());
  const graph = { nodes: [{ id: 'n' }], edges: [], zones: [], runState: 'idle' };
  const frames = [], unsubscribe = store.subscribeTerm('n', frame => frames.push(frame));
  let socket = sockets[0];
  socket.onopen();
  socket.receive({ type: 'graph', graph, generation: 'a', sequence: 1 });
  assert.equal(socket.sent.filter(m => m.type === 'term.subscribe').length, 1);
  socket.close();
  t.mock.timers.tick(1000);
  socket = sockets[1]; socket.onopen();
  socket.receive({ type: 'graph', graph, generation: 'b', sequence: 1 });
  assert.equal(socket.sent.filter(m => m.type === 'term.subscribe').length, 1);
  socket.receive({ type: 'term', nodeId: 'n', ansi: 'restored', generation: 'b', sequence: 2 });
  assert.deepEqual(frames, ['restored']);
  socket.receive({ type: 'term', nodeId: 'n', ansi: 'gap', generation: 'b', sequence: 4 });
  assert.equal(socket.sent.at(-1).type, 'hello');
  socket.receive({ type: 'graph', graph, generation: 'c', sequence: 1 });
  assert.equal(socket.sent.filter(m => m.type === 'term.subscribe').length, 2);
  unsubscribe();
  socket.receive({ type: 'graph', graph, generation: 'd', sequence: 1 });
  assert.equal(socket.sent.filter(m => m.type === 'term.subscribe').length, 2);
  const off = store.subscribeTerm('n', () => {});
  const before = socket.sent.length;
  socket.receive({ type: 'graph', graph, backend: 'e', generation: 'e', sequence: 1 });
  assert.equal(socket.sent.length, before, 'e sessions never replay herdr subscriptions');
  off();
});

test('archive node broadcasts notify canvas and stale HTTP views cannot roll back lifecycle',t=>{
 let socket;
 class Socket {
  static OPEN=1;readyState=1;
  constructor(){socket=this;}
  send(){}
  close(){this.readyState=3;}
  receive(message){this.onmessage({data:JSON.stringify({workspaceId:'w',...message})});}
 }
 const priorWS=globalThis.WebSocket,priorLocation=globalThis.location;
 globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'fixture',search:''};
 t.after(()=>{globalThis.WebSocket=priorWS;if(priorLocation===undefined)delete globalThis.location;else globalThis.location=priorLocation;});
 const store=new LiveStore('w');t.after(()=>store.dispose());socket.onopen();
 const node={id:'n',backend:'e',x:0,y:0};
 const graph={nodes:[node],edges:[],zones:[],runState:'idle'};
 socket.receive({type:'graph',backend:'e',graph});
 const live={workspaceId:'w',nodeId:'n',version:1,lifecycle:'ready'};
 store.applySessionView(live);
 let notifications=0;store.subscribe(()=>notifications++);
 const archived={...live,version:2,lifecycle:'stopped',archivedAt:'2026-01-01'};
 socket.receive({type:'node',node:{...node,archivedAt:archived.archivedAt}});
 assert.equal(notifications,1,'node arrives before session and must notify the canvas');
 socket.receive({type:'session',session:archived});
 store.applySessionView(live);
 assert.equal(store.nodes.get('n').archivedAt,archived.archivedAt,'late pre-archive HTTP ignored');
 socket.receive({type:'node',node});
 assert.equal(notifications,2,'restoration must also notify the canvas');
 socket.receive({type:'session',session:{...live,version:3}});
 store.applySessionView(archived);
 assert.equal(store.nodes.get('n').archivedAt,undefined,'late archive HTTP ignored');
 assert.equal(store.sessions.get('n').version,3);
 socket.receive({type:'graph',backend:'e',graph});
 assert.equal(store.nodes.get('n').archivedAt,undefined,'reconnect stays restored');
});

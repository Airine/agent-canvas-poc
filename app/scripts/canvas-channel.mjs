import { COLLABORATION_PROTOCOL_VERSION, CollaborationError, collaborationError, validateCollaborationHello, validateCollaborationRequest } from '../shared/collaboration-protocol.mjs';
/** Private inherited socket only. A channel is bound to one worker incarnation by its parent. */
export function createCanvasChannel(socket, expected, { onStatus, onCall, timeoutMs = 8000 }) {
  let state = { state: 'checking', expected, reason: '等待运行器确认 Skill 与工具版本' }, buffer = '', helloSeen = false, settled = false;
  const inflight = new Map();let settle;
  const ready = new Promise(resolve => { settle = resolve; });
  const timer = setTimeout(() => fail('unavailable', '运行器未在期限内确认协作版本'), timeoutMs);
  const write = value => { if (!socket.destroyed && socket.writable) socket.write(JSON.stringify(value) + '\n'); };
  function status(value) {
    state = value;onStatus(structuredClone(state));
    if (!settled && state.state !== 'checking') { settled = true;clearTimeout(timer);settle(structuredClone(state)); }
  }
  function fail(kind, reason) {
    status({ ...state, state: kind, reason });inflight.clear();socket.destroy();
  }
  function reject(id, error) { write({ protocolVersion: COLLABORATION_PROTOCOL_VERSION, id, ok: false, error: collaborationError(error) }); }
  function frame(value) {
    if (value?.type === 'hello') {
      if (helloSeen) { fail('incompatible', '协作通道收到重复握手，未继续使用');return; }
      helloSeen = true;
      const accepted = validateCollaborationHello(expected, value);
      write({ type: 'welcome', protocolVersion: COLLABORATION_PROTOCOL_VERSION, bundleHash: expected.bundleHash, accepted });
      status({ state: accepted ? 'ready' : 'incompatible', expected, loaded: value.manifest, skillDiscovered: value.skillDiscovered === true, activeTools: Array.isArray(value.activeTools) ? value.activeTools.filter(name => expected.tools.includes(name)) : [], instructionMode: value.instructionMode, ...(accepted ? { confirmedAt: new Date().toISOString() } : { reason: 'Skill、契约版本或工具注册未匹配；协作未启用' }) });
      if (!accepted) socket.end();
      return;
    }
    const id = value?.id;
    if (typeof id !== 'string' || !id || id.length > 300) { fail('incompatible', '无效的协作请求标识');return; }
    try {
      if (state.state !== 'ready') throw new CollaborationError('NOT_READY', 'Canvas handshake is not ready');
      if (value.type !== 'call' || value.request?.toolCallId !== id) throw new CollaborationError('INVALID_ARGUMENT', 'Canvas request identity mismatch');
      validateCollaborationRequest(value.request, expected);
      if (inflight.has(id)) throw new CollaborationError('CONFLICT', 'Canvas call is already unresolved; do not retry');
      if (inflight.size >= 16) throw new CollaborationError('LIMIT_EXCEEDED', 'Canvas private request capacity reached');
      inflight.set(id, value.request.tool);onCall({ id, request: value.request });
    } catch (error) { reject(id, error); }
  }
  socket.setEncoding('utf8');
  socket.on('data', chunk => {
    buffer += chunk;if (Buffer.byteLength(buffer) > 262144) { fail('incompatible', '协作请求超过通道容量');return; }
    for (;;) {
      const at = buffer.indexOf('\n');if (at < 0) break;
      const line = buffer.slice(0, at);buffer = buffer.slice(at + 1);
      try { frame(JSON.parse(line)); } catch { fail('incompatible', '协作通道帧无效');return; }
      if (socket.destroyed) return;
    }
  });
  const closed = () => { clearTimeout(timer);if (!['incompatible','unavailable'].includes(state.state)) status({ ...state, state: 'unavailable', reason: '协作通道已断开；未确认操作不会自动重试' });inflight.clear(); };
  socket.on('error', closed);socket.on('close', closed);
  onStatus(structuredClone(state));
  return { ready, getStatus: () => structuredClone(state), deliver(response) {
    if (state.state !== 'ready' || !inflight.has(response?.id)) return;
    inflight.delete(response.id);write(response);
  } };
}

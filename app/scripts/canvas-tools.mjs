import net from 'node:net';
import { Type } from '@earendil-works/pi-ai/compat';
import { readCollaborationPackage } from '../shared/collaboration-package.mjs';
import { COLLABORATION_PROTOCOL_VERSION, CollaborationError, collaborationError, manifestsMatch, piCollaborationTools, validateCollaborationArgs, validateCollaborationResult } from '../shared/collaboration-protocol.mjs';

/** Managed Pi adapter only: schemas and policy live in the versioned contract/Skill. */
export default function install(pi, setCloseOnExec, expected) {
  const fd = Number(process.env.CANVAS_TOOL_FD); delete process.env.CANVAS_TOOL_FD;
  if (!Number.isSafeInteger(fd) || fd < 3) throw new Error('Canvas requires a managed private descriptor');
  setCloseOnExec(fd);
  const socket = new net.Socket({ fd, readable: true, writable: true });
  const pending = new Map(); let buffer = '', closed = false, accepted = false, finishHello;
  let pkg;
  try { pkg = readCollaborationPackage(); } catch { /* report incompatible instead of disabling ordinary chat */ }
  const names = piCollaborationTools(Type).map(tool => tool.name);
  function disable() { accepted = false; try { pi.setActiveTools(pi.getActiveTools().filter(name => !names.includes(name))); } catch { /* session_start will retry after SDK binding */ } }
  const finishAll = () => {
    closed = true; disable(); finishHello?.(false);
    for (const waiter of pending.values()) waiter.reject(new CollaborationError('OUTCOME_UNKNOWN', 'Canvas channel closed; do not retry automatically'));
    pending.clear();
  };
  socket.on('error', finishAll); socket.on('close', finishAll); socket.setEncoding('utf8');
  socket.on('data', chunk => {
    buffer += chunk; if (Buffer.byteLength(buffer) > 1024 * 1024) { socket.destroy(); return; }
    for (;;) {
      const at = buffer.indexOf('\n'); if (at < 0) break;
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      let response; try { response = JSON.parse(line); } catch { socket.destroy(); return; }
      if (response.type === 'welcome') {
        const valid = response.accepted === true && response.protocolVersion === COLLABORATION_PROTOCOL_VERSION && response.bundleHash === pkg?.manifest.bundleHash;
        finishHello?.(valid); continue;
      }
      const waiter = pending.get(response.id); if (!waiter) continue;
      pending.delete(response.id);
      if (response.protocolVersion !== COLLABORATION_PROTOCOL_VERSION || typeof response.ok !== 'boolean') waiter.reject(new CollaborationError('OUTCOME_UNKNOWN', 'Canvas response protocol mismatch; do not retry'));
      else if (!response.ok) waiter.reject(new CollaborationError(response.error?.code, response.error?.message ?? 'Canvas request rejected'));
      else waiter.resolve(response.result);
    }
  });
  function unchanged() {
    if (!accepted || closed || !pkg) throw new CollaborationError('NOT_READY', 'Canvas collaboration is not verified; inspect session capability details');
    let current;try { current=readCollaborationPackage().manifest; } catch(error) { disable();socket.destroy();throw error; }
    if (!manifestsMatch(expected, current)) { disable(); socket.destroy(); throw new CollaborationError('PROTOCOL_MISMATCH', 'Canvas resources changed; explicitly reload the managed session'); }
  }
  for (const tool of piCollaborationTools(Type)) pi.registerTool({ name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters, executionMode: tool.executionMode, promptSnippet: tool.description,
    async execute(toolCallId, args, signal) {
      try {
      unchanged(); validateCollaborationArgs(tool.name, args); // Do not rewrite the arguments e approved.
      if (signal?.aborted) throw new CollaborationError('NOT_READY', 'Canvas tool cancelled before submission');
      if (pending.size >= 16) throw new CollaborationError('LIMIT_EXCEEDED', 'Canvas request limit reached');
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new CollaborationError('OUTCOME_UNKNOWN', 'Canvas timeout; no automatic retry')), 15000);
        const abort = () => finish(new CollaborationError('OUTCOME_UNKNOWN', 'Canvas cancelled after request; outcome may be unknown'));
        function finish(error, value) { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(toolCallId); error ? reject(error) : resolve(value); }
        pending.set(toolCallId, { resolve: value => finish(undefined, value), reject: error => finish(error) });
        signal?.addEventListener('abort', abort, { once: true });
        socket.write(JSON.stringify({ type: 'call', id: toolCallId, request: { protocolVersion: COLLABORATION_PROTOCOL_VERSION, bundleHash: pkg.manifest.bundleHash, toolCallId, tool: tool.name, args } }) + '\n');
      });
      const checked = validateCollaborationResult(tool.name, result);
      return { content: [{ type: 'text', text: JSON.stringify(checked) }], details: checked };
      } catch(error) { throw new Error(JSON.stringify({error:collaborationError(error)})); }
    },
  });
  pi.on('session_start', async () => {
    if (closed) { disable(); return; }
    const skillDiscovered = !!pkg && pi.getCommands().some(command => command.source === 'skill' && command.name === `skill:${pkg.manifest.skill.id}`);
    accepted = await new Promise(resolve => {
      const timer = setTimeout(() => { finishHello?.(false); socket.destroy(); }, 9000);
      finishHello = value => { clearTimeout(timer); finishHello = undefined; resolve(value); };
      socket.write(JSON.stringify({ type: 'hello', manifest: pkg?.manifest, skillDiscovered, activeTools: pi.getActiveTools(), instructionMode: 'system-prompt' }) + '\n');
    });
    if (!accepted) disable();
  });
  pi.on('before_agent_start', event => {
    if (!accepted) return;
    try { unchanged(); } catch { return; }
    // Same versioned file is available as a Pi Skill and bound into this managed session's instructions.
    return { systemPrompt: `${event.systemPrompt}\n\n${pkg.skillText}` };
  });
  pi.on('session_shutdown', () => socket.destroy());
}

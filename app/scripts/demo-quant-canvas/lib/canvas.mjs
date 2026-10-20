// A faithful-enough local model of the Canvas collaboration contract:
// immutable published artifacts, read edges, queued sends that are not
// consumption, paused targets, chain/frequency budgets, approval before every
// tool call. No HTTP, no filesystem reads, no sender identity from message text.

import { createHash } from 'node:crypto';

export class CanvasError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CanvasError';
    this.code = code;
  }
}

const MAX_CHARS = 12000;
const MAX_BYTES = 16 * 1024;
const MAX_CHAIN_HOPS = 4;
const MAX_SENDS_PER_RUN = 8;
const SEND_WINDOW_MS = 60_000;
const MAX_SENDS_PER_MINUTE = 10;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export class Canvas {
  constructor({ now = () => Date.now(), onEvent = null } = {}) {
    this.now = now;
    this.onEvent = onEvent;
    this.agents = new Map();
    this.artifacts = [];
    this.messages = [];
    this.reads = [];
    this.events = [];
    this.sendTimes = new Map();
    this.sendCounts = new Map();
    this.sequence = 0;
  }

  register({ name, role, status = 'ready' }) {
    const id = `agent-${this.agents.size + 1}`;
    const hash = sha256(`demo:${name}`).slice(0, 8);
    const agent = { id, name, role, status, ref: `@"${name}"#${hash}` };
    this.agents.set(id, agent);
    return agent;
  }

  byRef(ref) {
    const agent = [...this.agents.values()].find((item) => item.ref === ref || `#${item.ref.split('#')[1]}` === ref);
    if (!agent) throw new CanvasError('NOT_FOUND', `no agent for ${ref}`);
    return agent;
  }

  log(kind, actor, text, extra = {}) {
    this.sequence += 1;
    const event = { seq: this.sequence, kind, actor: actor?.name ?? 'human', text, ...extra };
    this.events.push(event);
    this.onEvent?.(event);
    return event;
  }

  approve({ tool, actor, detail, policy }) {
    const decision = policy({ tool, actor, detail });
    if (decision.approved) {
      this.log('approval', null, `${tool} · ${actor.name} · approved (manual)`, { tool });
      return decision;
    }
    this.log('denied', null, `${tool} · ${actor.name} · ${decision.code}: ${decision.reason}`, { tool });
    return decision;
  }

  publish(actor, { title, content }, approval) {
    requireApproval(approval);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (content.length > MAX_CHARS || bytes > MAX_BYTES) {
      throw new CanvasError('INVALID_ARGUMENT', `artifact too large: ${content.length} chars / ${bytes} bytes`);
    }
    const artifact = Object.freeze({
      id: `A${this.artifacts.length + 1}`,
      from: actor.id,
      title,
      content,
      chars: content.length,
      bytes,
      sha256: sha256(content),
      createdAt: this.now(),
    });
    this.artifacts.push(artifact);
    this.log('publish', actor, `${artifact.id} ${title} (${bytes}B, sha ${artifact.sha256.slice(0, 8)})`);
    return artifact;
  }

  read(actor, target, artifactId, approval) {
    requireApproval(approval);
    if (target.id === actor.id) throw new CanvasError('INVALID_ARGUMENT', 'self-read is not useful');
    const artifact = this.artifacts.find((item) => item.id === artifactId && item.from === target.id);
    if (!artifact) throw new CanvasError('NOT_FOUND', `${target.name} has no artifact ${artifactId}`);
    this.reads.push({
      seq: this.reads.length + 1,
      from: actor.id,
      to: target.id,
      artifactId: artifact.id,
      sha256: artifact.sha256,
    });
    this.log('read', actor, `${artifact.id} from ${target.name} (sha ${artifact.sha256.slice(0, 8)})`);
    return artifact;
  }

  send(actor, target, text, { chainId, hop }, approval) {
    requireApproval(approval);
    if (target.id === actor.id) throw new CanvasError('INVALID_ARGUMENT', 'cannot send to self');
    if (text.length > MAX_CHARS || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
      throw new CanvasError('INVALID_ARGUMENT', 'message too large');
    }
    if (hop > MAX_CHAIN_HOPS) {
      throw new CanvasError(
        'BUDGET_EXHAUSTED',
        `chain ${chainId} would exceed ${MAX_CHAIN_HOPS} hops; return to the human`,
      );
    }
    if ((this.sendCounts.get(actor.id) ?? 0) >= MAX_SENDS_PER_RUN) {
      throw new CanvasError('BUDGET_EXHAUSTED', `per-run send cap ${MAX_SENDS_PER_RUN} reached for ${actor.name}`);
    }
    const timestamp = this.now();
    const recent = (this.sendTimes.get(actor.id) ?? []).filter((time) => timestamp - time < SEND_WINDOW_MS);
    if (recent.length >= MAX_SENDS_PER_MINUTE) {
      throw new CanvasError('BUDGET_EXHAUSTED', `per-minute send cap ${MAX_SENDS_PER_MINUTE} reached`);
    }
    recent.push(timestamp);
    this.sendTimes.set(actor.id, recent);
    this.sendCounts.set(actor.id, (this.sendCounts.get(actor.id) ?? 0) + 1);

    const message = {
      id: `M${this.messages.length + 1}`,
      from: actor.id,
      to: target.id,
      text,
      chainId,
      hop,
      state: target.status === 'paused' ? 'paused' : 'pending',
      createdAt: timestamp,
    };
    this.messages.push(message);
    this.log('send', actor, `→ ${target.name} · ${message.state} · hop ${hop}/${MAX_CHAIN_HOPS} · ${text}`, {
      messageId: message.id,
    });
    return message;
  }

  newRun() {
    this.sendCounts.clear();
    this.sendTimes.clear();
    this.log('note', null, 'new human task: per-run send budget reset; chains must start fresh');
  }

  consume(actor) {
    const ready = this.messages.filter((message) => message.to === actor.id && message.state === 'pending');
    for (const message of ready) message.state = 'consumed';
    if (ready.length > 0) {
      this.log('consume', actor, `${ready.length} message(s): ${ready.map((message) => message.id).join(', ')}`);
    }
    return ready;
  }

  pause(actor) {
    actor.status = 'paused';
    this.log('pause', actor, 'session paused by user');
  }

  resume(actor) {
    actor.status = 'ready';
    this.log('resume', actor, 'session resumed; queued messages stay paused');
  }

  resumeQueue(actor) {
    const paused = this.messages.filter((message) => message.to === actor.id && message.state === 'paused');
    for (const message of paused) message.state = 'pending';
    if (paused.length > 0) this.log('resume_queue', actor, `${paused.length} message(s) released: ${paused.map((m) => m.id).join(', ')}`);
    return paused;
  }

  edges() {
    const grouped = new Map();
    for (const read of this.reads) {
      const key = `${read.from}->${read.to}:read`;
      const current = grouped.get(key) ?? { from: read.from, to: read.to, kind: 'read', count: 0, last: '' };
      current.count += 1;
      current.last = read.artifactId;
      grouped.set(key, current);
    }
    for (const message of this.messages) {
      const key = `${message.from}->${message.to}:send`;
      const current = grouped.get(key) ?? { from: message.from, to: message.to, kind: 'send', count: 0, last: '' };
      current.count += 1;
      current.last = message.state;
      grouped.set(key, current);
    }
    return [...grouped.values()].map((edge) => ({
      ...edge,
      fromName: this.agents.get(edge.from)?.name ?? edge.from,
      toName: this.agents.get(edge.to)?.name ?? edge.to,
    }));
  }

  artifactById(id) {
    const artifact = this.artifacts.find((item) => item.id === id);
    if (!artifact) throw new CanvasError('NOT_FOUND', `no artifact ${id}`);
    return artifact;
  }
}

function requireApproval(approval) {
  if (!approval || approval.approved !== true) {
    throw new CanvasError('FORBIDDEN', 'tool call was not approved');
  }
}

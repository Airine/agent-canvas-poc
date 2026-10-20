/** One portable contract for model tool schemas, server validation and inspection. No transport authority here. */
export const COLLABORATION_PROTOCOL_VERSION = 2;
export const COLLABORATION_EXTENSION_VERSION = 2;
export const COLLABORATION_SKILL = Object.freeze({ id: 'canvas-collaboration', version: 2 });
export const COLLABORATION_LIMITS = Object.freeze({ textCharacters: 12000, textBytes: 16384, targetCharacters: 600, sendsPerRun: 8, sendsPerMinute: 10, chainHops: 4, chainMessages: 16, artifactsPerAgent: 100, artifacts: 1000, records: 5000, receipts: 10000, spawnDepth: 2, spawnChildren: 3, spawnPerRun: 2, spawnSessions: 8 });
export const COLLABORATION_ERROR_CODES = Object.freeze(['INVALID_ARGUMENT', 'UNSUPPORTED_TOOL', 'PROTOCOL_MISMATCH', 'NOT_READY', 'EVIDENCE_PENDING', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'LIMIT_EXCEEDED', 'OUTCOME_UNKNOWN', 'INVALID_RESULT', 'INTERNAL']);
const string = (maxLength = 1000, extra = {}) => ({ type: 'string', maxLength, ...extra });
const number = (extra = {}) => ({ type: 'number', ...extra });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, maxItems) => ({ type: 'array', items, ...(maxItems === undefined ? {} : { maxItems }) });
const boolean = { type: 'boolean' };
const target = string(COLLABORATION_LIMITS.targetCharacters, { minLength: 1, description: 'Exact copied @"name"#hash reference or exact hash from canvas_agents. Same Canvas only.' });
const text = string(COLLABORATION_LIMITS.textCharacters, { minLength: 1, 'x-maxUtf8Bytes': COLLABORATION_LIMITS.textBytes });
const artifactMetadata = object({ id: string(), title: string(120), digest: string(64), createdAt: string() });
const peer = object({ reference: string(), lifecycle: string(30, { enum: ['starting', 'ready', 'stopped', 'interrupted', 'failed'] }), collaborationAvailable: boolean, queuePaused: boolean, latestReplyId: string(), artifacts: array(artifactMetadata, 20) }, ['reference', 'lifecycle', 'collaborationAvailable', 'queuePaused', 'artifacts']);
const definitions = [
  { name: 'canvas_agents', label: 'Canvas · 同伴', effect: 'read', description: 'List other Agents in this Canvas, exact references, lifecycle and published text artifact metadata. Excludes self. Does not send.',
    parameters: object({}), result: object({ self: string(), agents: array(peer), rules: string(2000) }) },
  { name: 'canvas_read', label: 'Canvas · 读取产物', effect: 'read', description: 'Read a peer’s published text artifact or completed text reply; omit artifactId for the latest nonempty reply. No arbitrary files, thinking or tool logs. Records the actual read with source and digest.',
    parameters: object({ target, artifactId: string(300) }, ['target']), result: object({ communicationId: string(), source: string(), artifactId: string(), digest: string(64), content: string(12000), truncated: boolean, trust: string(2000) }) },
  { name: 'canvas_publish', label: 'Canvas · 发布产物', effect: 'publish', description: 'Publish an immutable text result in this Canvas, at most 12000 characters and 16 KiB UTF-8. No filesystem upload. Read the canvas-collaboration skill for scope and limits.',
    parameters: object({ title: string(120, { minLength: 1, pattern: '\\S' }), content: text }), result: object({ id: string(), workspaceId: string(), nodeId: string(), nativeSessionId: string(), title: string(120), content: text, digest: string(64), createdAt: string(), reference: string() }) },
  { name: 'canvas_send', label: 'Canvas · 发送消息', effect: 'enqueue', description: 'Queue a necessary message for a peer’s next turn. No Steer, wake or auto-resume. A pending/paused receipt is not consumption or completion. Read the canvas-collaboration skill before coordinating.',
    parameters: object({ target, message: text }), result: object({ communicationId: string(), target: string(), state: string(10, { enum: ['pending', 'paused'] }), note: string(2000) }) },
  { name: 'canvas_spawn', label: 'Canvas · 派生会话', effect: 'spawn', description: 'Create one new Canvas card/session in this workspace, with the given task as its first input, and a spawn edge from this session. Requires human approval; bounded by depth, children, per-run and workspace limits. The child starts as starting and is not confirmed ready.',
    parameters: object({ title: string(120, { minLength: 1, pattern: '\\S' }), task: text }), result: object({ spawnId: string(), nodeId: string(), workspaceId: string(), reference: string(), state: string(10, { enum: ['starting'] }), depth: number(), note: string(2000) }) },
].map(tool => ({ ...tool, approval: 'e-exact-tool', scope: 'same-canvas', executionMode: 'sequential', automaticRetry: false }));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const COLLABORATION_TOOLS = freeze(definitions);
export const COLLABORATION_TOOL_NAMES = Object.freeze(definitions.map(tool => tool.name));
export const COLLABORATION_CONTRACT = freeze({ protocolVersion: COLLABORATION_PROTOCOL_VERSION, extensionVersion: COLLABORATION_EXTENSION_VERSION, skill: COLLABORATION_SKILL, limits: COLLABORATION_LIMITS, errors: COLLABORATION_ERROR_CODES, tools: COLLABORATION_TOOLS });
export class CollaborationError extends Error {
  constructor(code, message) { super(message); this.name = 'CollaborationError'; this.code = COLLABORATION_ERROR_CODES.includes(code) ? code : 'INTERNAL'; }
}
export function collaborationError(error) {
  return error instanceof CollaborationError
    ? { code: error.code, message: error.message, retryable: false }
    : { code: 'INTERNAL', message: 'Canvas operation failed; inspect diagnostics. Do not automatically retry.', retryable: false };
}
function invalid(at, message) { throw new CollaborationError('INVALID_ARGUMENT', `${at}: ${message}`); }
/** Validates the deliberately small JSON Schema vocabulary used by this version. */
function validate(schema, value, at) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(at, 'expected object');
    for (const key of schema.required ?? []) if (value[key] === undefined || !Object.hasOwn(value, key)) invalid(`${at}.${key}`, 'required');
    const result = {};
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) invalid(`${at}.${key}`, 'unknown field');
      if (value[key] !== undefined) result[key] = validate(schema.properties[key], value[key], `${at}.${key}`);
    }
    return result;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || schema.maxItems !== undefined && value.length > schema.maxItems) invalid(at, 'invalid array or capacity exceeded');
    return value.map((entry, index) => validate(schema.items, entry, `${at}[${index}]`));
  }
  if (typeof value !== schema.type) invalid(at, `expected ${schema.type}`);
  if (schema.enum && !schema.enum.includes(value)) invalid(at, 'unsupported value');
  if (schema.type === 'string') {
    if (value.length < (schema.minLength ?? 0) || value.length > schema.maxLength) invalid(at, 'character limit exceeded');
    if ([...value].some(char => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff)) invalid(at, 'invalid Unicode');
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) invalid(at, 'invalid format');
    if (schema['x-maxUtf8Bytes'] && new TextEncoder().encode(value).byteLength > schema['x-maxUtf8Bytes']) invalid(at, 'text exceeds 16 KiB UTF-8');
  }
  return value;
}
export function collaborationTool(name) {
  const tool = COLLABORATION_TOOLS.find(tool => tool.name === name);
  if (!tool) throw new CollaborationError('UNSUPPORTED_TOOL', 'unsupported Canvas tool');
  return tool;
}
export function validateCollaborationArgs(name, value) { return validate(collaborationTool(name).parameters, value, name); }
export function validateCollaborationResult(name, value) {
  try { return validate(collaborationTool(name).result, value, `${name}.result`); }
  catch (error) { throw new CollaborationError('INVALID_RESULT', error instanceof Error ? error.message : 'invalid Canvas result'); }
}
/** TypeBox is supplied by the installed Pi SDK; the contract itself has no Pi dependency. */
export function piCollaborationTools(Type) {
  function schema(value) {
    if (value.type === 'object') return Type.Object(Object.fromEntries(Object.entries(value.properties).map(([key, child]) => [key, value.required.includes(key) ? schema(child) : Type.Optional(schema(child))])), { additionalProperties: false });
    if (value.type === 'string') { const { type: _type, ...options } = value; return Type.String(options); }
    throw new Error('unsupported model parameter schema');
  }
  return COLLABORATION_TOOLS.map(tool => ({ ...tool, parameters: schema(tool.parameters) }));
}
export function manifestsMatch(expected, loaded) {
  return !!expected && !!loaded && expected.protocolVersion === COLLABORATION_PROTOCOL_VERSION &&
    expected.extensionVersion === COLLABORATION_EXTENSION_VERSION && expected.skill?.id === COLLABORATION_SKILL.id && expected.skill?.version === COLLABORATION_SKILL.version && Array.isArray(expected.tools) && /^[a-f0-9]{64}$/.test(expected.bundleHash ?? '') && /^[a-f0-9]{64}$/.test(expected.contractHash ?? '') && /^[a-f0-9]{64}$/.test(expected.skill?.hash ?? '') &&
    expected.protocolVersion === loaded.protocolVersion && expected.extensionVersion === loaded.extensionVersion &&
    expected.contractHash === loaded.contractHash && expected.skill?.id === loaded.skill?.id &&
    expected.skill?.version === loaded.skill?.version && expected.skill?.hash === loaded.skill?.hash &&
    expected.bundleHash === loaded.bundleHash && JSON.stringify(expected.tools) === JSON.stringify(loaded.tools);
}
export function validateCollaborationHello(expected, hello) {
  return hello?.type === 'hello' && manifestsMatch(expected, hello.manifest) && hello.skillDiscovered === true && hello.instructionMode === 'system-prompt' &&
    Array.isArray(hello.activeTools) && expected.tools.every(name => hello.activeTools.includes(name));
}
export function validateCollaborationRequest(request, manifest) {
  if (!request || request.protocolVersion !== COLLABORATION_PROTOCOL_VERSION || request.bundleHash !== manifest?.bundleHash) throw new CollaborationError('PROTOCOL_MISMATCH', 'Canvas protocol/package mismatch; reload the managed session');
  if (typeof request.toolCallId !== 'string' || !request.toolCallId || request.toolCallId.length > 300) throw new CollaborationError('INVALID_ARGUMENT', 'invalid tool call identity');
  if(Object.keys(request).some(key=>!['protocolVersion','bundleHash','toolCallId','tool','args'].includes(key)))throw new CollaborationError('INVALID_ARGUMENT','unknown Canvas request field');
  validateCollaborationArgs(request.tool, request.args);
  return request;
}

export function collaborationReady(status) {
  return status?.state === 'ready' && validateCollaborationHello(status.expected, {type:'hello', manifest:status.loaded, skillDiscovered:status.skillDiscovered, activeTools:status.activeTools, instructionMode:status.instructionMode});
}

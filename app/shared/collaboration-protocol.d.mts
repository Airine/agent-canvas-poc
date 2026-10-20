export const COLLABORATION_PROTOCOL_VERSION: 2;
export const COLLABORATION_EXTENSION_VERSION: 2;
export const COLLABORATION_SKILL: Readonly<{id: 'canvas-collaboration'; version: 2}>;
export const COLLABORATION_TOOL_NAMES: readonly ['canvas_agents','canvas_read','canvas_publish','canvas_send','canvas_spawn'];
export type CanvasTool = typeof COLLABORATION_TOOL_NAMES[number];
export type CollaborationErrorCode = 'INVALID_ARGUMENT'|'UNSUPPORTED_TOOL'|'PROTOCOL_MISMATCH'|'NOT_READY'|'EVIDENCE_PENDING'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'LIMIT_EXCEEDED'|'OUTCOME_UNKNOWN'|'INVALID_RESULT'|'INTERNAL';
export const COLLABORATION_ERROR_CODES: readonly CollaborationErrorCode[];
export const COLLABORATION_LIMITS: Readonly<{textCharacters:number;textBytes:number;targetCharacters:number;sendsPerRun:number;sendsPerMinute:number;chainHops:number;chainMessages:number;artifactsPerAgent:number;artifacts:number;records:number;receipts:number;spawnDepth:number;spawnChildren:number;spawnPerRun:number;spawnSessions:number}>;
export interface CollaborationToolDefinition {name:CanvasTool;label:string;description:string;effect:'read'|'publish'|'enqueue'|'spawn';approval:'e-exact-tool';scope:'same-canvas';executionMode:'sequential';automaticRetry:false;parameters:Record<string,unknown>;result:Record<string,unknown>}
export const COLLABORATION_TOOLS: readonly CollaborationToolDefinition[];
export const COLLABORATION_CONTRACT: Readonly<Record<string,unknown>>;
export interface CollaborationManifest {protocolVersion:number;extensionVersion:number;contractHash:string;skill:{id:string;version:number;hash:string};tools:CanvasTool[];bundleHash:string}
export interface CollaborationStatus {state:'unavailable'|'checking'|'ready'|'incompatible';reason?:string;expected?:CollaborationManifest;loaded?:CollaborationManifest;skillDiscovered?:boolean;activeTools?:string[];instructionMode?:'system-prompt';confirmedAt?:string}
export interface CollaborationRequest {protocolVersion:number;bundleHash:string;toolCallId:string;tool:CanvasTool;args:Record<string,unknown>}
export interface CollaborationFailure {code:CollaborationErrorCode;message:string;retryable:false}
export type CollaborationResponse = {protocolVersion:2;id:string;ok:true;result:unknown}|{protocolVersion:2;id:string;ok:false;error:CollaborationFailure};
export class CollaborationError extends Error {readonly code:CollaborationErrorCode;constructor(code:CollaborationErrorCode,message:string)}
export function collaborationError(error:unknown):CollaborationFailure;
export function collaborationTool(name:string):CollaborationToolDefinition;
export function validateCollaborationArgs(name:string,value:unknown):Record<string,string>;
export function validateCollaborationResult(name:string,value:unknown):unknown;
export function piCollaborationTools(typebox:unknown):CollaborationToolDefinition[];
export function manifestsMatch(expected:unknown,loaded:unknown):boolean;
export function validateCollaborationHello(expected:CollaborationManifest,hello:unknown):boolean;
export function validateCollaborationRequest(request:unknown,manifest:CollaborationManifest|undefined):CollaborationRequest;
export function collaborationReady(status:CollaborationStatus|undefined):boolean;

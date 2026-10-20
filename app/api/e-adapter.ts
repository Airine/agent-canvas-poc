/** Official managed e runtime; no legacy socket or synthetic bind. */
export { eSessions, SessionManager } from './e/session-manager.js';
export { runtimeStatus } from './e/config.js';
export { projectSession } from './e/projection.js';
export type { SessionView, SessionSnapshot, SessionRef } from './e/contracts.js';

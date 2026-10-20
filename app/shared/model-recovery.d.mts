export interface ModelRecovery { state:'waiting'|'retrying'|'recovered'|'cancelled'|'failed'|'unknown'; attempt:number; maxAttempts:number; retryAt?:number; updatedAt:number }
export function recoveryEvent(previous:ModelRecovery|undefined,event:unknown,now?:number):ModelRecovery|undefined;

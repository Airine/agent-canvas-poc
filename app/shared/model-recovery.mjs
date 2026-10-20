/** Projection of Pi RPC facts only. Never sends prompts or retries tools. */
export function recoveryEvent(previous, event, now = Date.now()) {
  if (!event || typeof event !== 'object') return previous;
  if (event.type === 'auto_retry_start') {
    const { attempt, maxAttempts, delayMs } = event;
    if (![attempt, maxAttempts, delayMs].every(Number.isSafeInteger) || attempt < 1 || maxAttempts < attempt || delayMs < 0) return previous;
    return { state: 'waiting', attempt, maxAttempts, retryAt: now + delayMs, updatedAt: now };
  }
  if (event.type === 'auto_retry_end' && previous && typeof event.success === 'boolean') {
    return { ...previous, state: event.success ? 'recovered' : event.finalError === 'Retry cancelled' ? 'cancelled' : 'failed', retryAt: undefined, updatedAt: now };
  }
  if (event.type === 'agent_start') {
    return previous?.state === 'waiting' ? { ...previous, state: 'retrying', retryAt: undefined, updatedAt: now } : undefined;
  }
  if (event.type === 'agent_settled' && ['waiting', 'retrying'].includes(previous?.state)) {
    return { ...previous, state: 'unknown', retryAt: undefined, updatedAt: now };
  }
  return previous;
}

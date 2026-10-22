/** A local review can waive only its exact unknown send, never a live or unrelated action. */
export function isReviewedQueueAction(queue, action) {
  return action.kind === 'send' && action.state === 'outcome-unknown' && !!queue?.items.some(item =>
    item.state === 'dismissed' && item.review?.decision === 'stop-tracking' &&
    (action.idempotencyKey
      ? action.idempotencyKey === item.intentId && (!item.actionId || item.actionId === action.id)
      : !!item.actionId && item.actionId === action.id));
}

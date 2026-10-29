/**
 * Whether a Convert tap may start the batch.
 *
 * This exists because the answer used to be spread over four guards inside the
 * screen, and one of them — an `await` on the notification permission — could
 * wait forever. A queued row that never starts is indistinguishable from a row
 * that is waiting its turn, so the bug looked like a hung queue rather than a
 * blocked start.
 *
 * The rule this function encodes is the fix: **the start decision depends only on
 * the queue**. Nothing about notifications, permissions, or the foreground
 * service may appear here, because none of them is a reason to refuse to convert
 * (TR-29). Everything else about the batch is a courtesy layered on top.
 */

import { queueCounts, type QueueState } from '../domain/queue';

export type BatchStartRefusal = 'already-running' | 'nothing-queued';

export type BatchStartDecision =
  | { readonly start: true; readonly batchSize: number }
  | { readonly start: false; readonly reason: BatchStartRefusal };

/**
 * @param state the queue as the loop sees it.
 * @param alreadyRunning whether a loop is already inside `runQueue`.
 *
 * `batchSize` counts every row, not every queued row: the loop uses it to decide
 * whether the batch is "one file" (probe reuse, automatic copy to Photos, a
 * muxed subtitle sidecar) and that question is about the batch the user built,
 * including rows that already finished.
 */
export function decideBatchStart(
  state: QueueState,
  alreadyRunning: boolean,
): BatchStartDecision {
  if (alreadyRunning) {
    return { start: false, reason: 'already-running' };
  }

  const counts = queueCounts(state);

  // A row that is converting means a loop owns the queue, even if this component
  // has just mounted and its own guard has not been set yet.
  if (counts.converting > 0) {
    return { start: false, reason: 'already-running' };
  }

  if (counts.queued === 0) {
    return { start: false, reason: 'nothing-queued' };
  }

  return { start: true, batchSize: state.jobs.length };
}

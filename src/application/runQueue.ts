/**
 * Runs a queue, strictly one row at a time.
 *
 * The loop asks for the next row every iteration instead of iterating a snapshot
 * taken at the start: if the user cancels the row that was second in line while
 * the first is still converting, that row is simply no longer queued and the loop
 * never sees it. Cancellation therefore needs no special case here — the queue
 * reducer already answered the question (TR-09, PR-11).
 *
 * A row that throws is turned into a failed row rather than ending the batch, so
 * one broken file cannot take the other nine down with it (TR-30).
 */

import { describeUnexpectedFailure } from '../domain/errors';
import type { QueueJob } from '../domain/queue';
import type { ConversionResult } from './runConversion';

export interface QueueRunnerOptions {
  /** The next row to run, read fresh each time. `null` ends the batch. */
  readonly nextJob: () => QueueJob | null;
  /** Runs one row; resolves when the engine has settled. */
  readonly convert: (job: QueueJob) => Promise<ConversionResult>;
  readonly onStarted?: (job: QueueJob) => void;
  readonly onFinished?: (job: QueueJob, result: ConversionResult) => void;
}

export interface QueueRunSummary {
  /** Rows that reached a terminal state during this run. */
  readonly processed: number;
  /**
   * True when the same row was handed back twice in a row, which means the
   * `queue/started` dispatch did not take effect. The loop stops instead of
   * re-encoding the same file forever.
   */
  readonly stalled: boolean;
}

export async function runQueue(options: QueueRunnerOptions): Promise<QueueRunSummary> {
  let processed = 0;
  let previousId: string | null = null;

  for (;;) {
    const job = options.nextJob();
    if (job === null) {
      return { processed, stalled: false };
    }
    if (job.id === previousId) {
      return { processed, stalled: true };
    }
    previousId = job.id;

    options.onStarted?.(job);

    let result: ConversionResult;
    try {
      result = await options.convert(job);
    } catch (error) {
      result = {
        status: 'failed',
        summary: null,
        outputPath: null,
        failure: describeUnexpectedFailure(error),
      };
    }

    processed += 1;
    options.onFinished?.(job, result);
  }
}

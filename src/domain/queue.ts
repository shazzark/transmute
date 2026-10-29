/**
 * The batch queue.
 *
 * A pure reducer, like the single-job machine, so every ordering question — what
 * runs next, what a cancel does to a row that has not started, what a retry does
 * to the queue behind it — is answered by a tested function instead of by
 * whichever component happens to hold a copy of the list (TR-09, TR-21).
 *
 * Two rules are structural rather than conventional:
 *
 * 1. **One conversion at a time.** `queue/started` is refused while any job is
 *    already converting. That is what keeps a phone with four cores from running
 *    four encodes, overheating, and finishing all of them late (TR-09).
 * 2. **A terminal row never moves again** except by an explicit retry. Progress
 *    and completion arriving late for a cancelled row change nothing, so a race
 *    between the engine and Cancel cannot rewrite the outcome.
 */

import type { Failure } from './errors';
import type { OutputFile, SourceFile } from './mediaFiles';
import { DEFAULT_PRESET_ID, type PresetId } from './presets';

export type QueueStatus = 'queued' | 'converting' | 'complete' | 'failed' | 'cancelled';

export interface QueueJob {
  readonly id: string;
  readonly source: SourceFile;
  readonly status: QueueStatus;
  /** Whole percent of the source processed; monotonic inside one attempt. */
  readonly progress: number;
  /** True while the duration is unknown, so the row shows movement, not a number. */
  readonly indeterminate: boolean;
  readonly elapsedMs: number;
  readonly output: OutputFile | null;
  readonly failure: Failure | null;
  /** How many times this row has been started; 1 after the first attempt. */
  readonly attempts: number;
  /** True between a Cancel tap and the engine settling, so the row cannot lie. */
  readonly cancelRequested: boolean;
}

export interface QueueState {
  /** In the order the user picked them; that order is the run order. */
  readonly jobs: readonly QueueJob[];
  /** One format for the batch. Per-row formats are Phase 4 work, not this one. */
  readonly presetId: PresetId;
  /** Set by Cancel All: no further row may start until Convert is tapped again. */
  readonly stopRequested: boolean;
  /** Next `job-N` number, so identifiers are stable and never reused. */
  readonly nextNumber: number;
}

export const initialQueueState: QueueState = {
  jobs: [],
  presetId: DEFAULT_PRESET_ID,
  stopRequested: false,
  nextNumber: 1,
};

export type QueueAction =
  | { readonly type: 'queue/added'; readonly sources: readonly SourceFile[] }
  | { readonly type: 'queue/runRequested' }
  | { readonly type: 'queue/started'; readonly id: string }
  | {
      readonly type: 'queue/progress';
      readonly id: string;
      readonly percent: number | null;
      readonly elapsedMs: number;
    }
  | { readonly type: 'queue/completed'; readonly id: string; readonly output: OutputFile }
  | { readonly type: 'queue/failed'; readonly id: string; readonly failure: Failure }
  | { readonly type: 'queue/cancelRequested'; readonly id: string }
  | { readonly type: 'queue/cancelled'; readonly id: string }
  | { readonly type: 'queue/removed'; readonly id: string }
  | { readonly type: 'queue/retried'; readonly id: string }
  | { readonly type: 'queue/cancelAll' }
  | { readonly type: 'queue/cleared' }
  | { readonly type: 'queue/presetSelected'; readonly presetId: PresetId }
  | { readonly type: 'queue/reset' };

/** Rows that no longer need the engine. */
export function isTerminal(status: QueueStatus): boolean {
  return status === 'complete' || status === 'failed' || status === 'cancelled';
}

/** A row the user can cancel, either before it starts or while it runs. */
export function isCancellable(job: QueueJob): boolean {
  return job.status === 'queued' || job.status === 'converting';
}

/** A finished row that can be offered again; cancelling by mistake is recoverable. */
export function canRetry(job: QueueJob): boolean {
  return job.status === 'failed' || job.status === 'cancelled';
}

function replace(state: QueueState, id: string, change: (job: QueueJob) => QueueJob): QueueState {
  let changed = false;
  const jobs = state.jobs.map((job) => {
    if (job.id !== id) {
      return job;
    }
    const next = change(job);
    if (next !== job) {
      changed = true;
    }
    return next;
  });
  // Returning the same object for an ignored action keeps React from re-rendering
  // for nothing, and makes "nothing happened" observable in tests.
  return changed ? { ...state, jobs } : state;
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'queue/added': {
      if (action.sources.length === 0) {
        return state;
      }
      const added: QueueJob[] = action.sources.map((source, index) => ({
        id: `job-${state.nextNumber + index}`,
        source,
        status: 'queued',
        progress: 0,
        indeterminate: true,
        elapsedMs: 0,
        output: null,
        failure: null,
        attempts: 0,
        cancelRequested: false,
      }));
      return {
        ...state,
        jobs: [...state.jobs, ...added],
        nextNumber: state.nextNumber + added.length,
      };
    }

    case 'queue/runRequested':
      return state.stopRequested ? { ...state, stopRequested: false } : state;

    case 'queue/started': {
      if (state.stopRequested) {
        return state;
      }
      // One at a time: a second start while a row converts is not an error, it is
      // simply not this row's turn.
      if (state.jobs.some((job) => job.status === 'converting')) {
        return state;
      }
      return replace(state, action.id, (job) =>
        job.status === 'queued'
          ? {
              ...job,
              status: 'converting',
              progress: 0,
              indeterminate: true,
              elapsedMs: 0,
              output: null,
              failure: null,
              attempts: job.attempts + 1,
              cancelRequested: false,
            }
          : job,
      );
    }

    case 'queue/progress':
      return replace(state, action.id, (job) => {
        if (job.status !== 'converting') {
          return job;
        }
        const percent =
          action.percent === null
            ? job.progress
            : Math.max(job.progress, Math.min(100, action.percent));
        return {
          ...job,
          progress: percent,
          indeterminate: action.percent === null,
          elapsedMs: Math.max(job.elapsedMs, action.elapsedMs),
        };
      });

    case 'queue/completed':
      return replace(state, action.id, (job) =>
        job.status === 'converting'
          ? {
              ...job,
              status: 'complete',
              output: action.output,
              // The row is full before it reads "Complete", never after (TR-04).
              progress: 100,
              indeterminate: false,
              failure: null,
              cancelRequested: false,
            }
          : job,
      );

    case 'queue/failed':
      return replace(state, action.id, (job) =>
        job.status === 'converting'
          ? {
              ...job,
              status: 'failed',
              failure: action.failure,
              output: null,
              indeterminate: false,
              cancelRequested: false,
            }
          : job,
      );

    case 'queue/cancelRequested':
      return replace(state, action.id, (job) =>
        job.status === 'converting' ? { ...job, cancelRequested: true } : job,
      );

    case 'queue/cancelled':
      return replace(state, action.id, (job) =>
        isCancellable(job)
          ? {
              ...job,
              status: 'cancelled',
              output: null,
              failure: null,
              indeterminate: false,
              cancelRequested: false,
            }
          : job,
      );

    case 'queue/removed':
      return state.jobs.some((job) => job.id === action.id && job.status === 'queued')
        ? { ...state, jobs: state.jobs.filter((job) => job.id !== action.id) }
        : state;

    case 'queue/retried':
      return replace(state, action.id, (job) =>
        canRetry(job)
          ? {
              ...job,
              status: 'queued',
              progress: 0,
              indeterminate: true,
              elapsedMs: 0,
              output: null,
              failure: null,
              cancelRequested: false,
            }
          : job,
      );

    case 'queue/cancelAll': {
      const running = state.jobs.some((job) => job.status === 'converting');
      if (!running && !state.jobs.some((job) => job.status === 'queued')) {
        return state;
      }
      return {
        ...state,
        // Only a running row needs the engine stopped; if nothing is running the
        // batch is simply emptied and may start again on the next Convert tap.
        stopRequested: running,
        jobs: state.jobs.map((job) => {
          if (job.status === 'queued') {
            // A row that never started leaves no cache behind (PR-11).
            return { ...job, status: 'cancelled', indeterminate: false };
          }
          if (job.status === 'converting') {
            // The engine stops on request and reports; the row must not claim to
            // have stopped before it has (TR-11).
            return { ...job, cancelRequested: true };
          }
          return job;
        }),
      };
    }

    case 'queue/cleared':
      return {
        ...state,
        jobs: state.jobs.filter((job) => !isTerminal(job.status)),
      };

    case 'queue/presetSelected':
      // The format belongs to every row, so changing it mid-run would leave the
      // batch half in one container; the selector is disabled, and this guards it.
      if (state.jobs.some((job) => job.status === 'converting')) {
        return state;
      }
      return { ...state, presetId: action.presetId };

    case 'queue/reset':
      return { ...initialQueueState, presetId: state.presetId };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** The row the engine is working on, if any. */
export function activeJob(state: QueueState): QueueJob | null {
  return state.jobs.find((job) => job.status === 'converting') ?? null;
}

/** The next row in line: first in, first out, skipping anything finished. */
export function nextQueuedJob(state: QueueState): QueueJob | null {
  return state.jobs.find((job) => job.status === 'queued') ?? null;
}

export function jobById(state: QueueState, id: string): QueueJob | null {
  return state.jobs.find((job) => job.id === id) ?? null;
}

/** 1-based place of a row in the batch, for "Converting 2 of 3". */
export function positionOf(state: QueueState, id: string): number {
  const index = state.jobs.findIndex((job) => job.id === id);
  return index === -1 ? 0 : index + 1;
}

export interface QueueCounts {
  readonly total: number;
  readonly queued: number;
  readonly converting: number;
  readonly complete: number;
  readonly failed: number;
  readonly cancelled: number;
}

export function queueCounts(state: QueueState): QueueCounts {
  return {
    total: state.jobs.length,
    queued: state.jobs.filter((job) => job.status === 'queued').length,
    converting: state.jobs.filter((job) => job.status === 'converting').length,
    complete: state.jobs.filter((job) => job.status === 'complete').length,
    failed: state.jobs.filter((job) => job.status === 'failed').length,
    cancelled: state.jobs.filter((job) => job.status === 'cancelled').length,
  };
}

/**
 * Whole-batch percent: the mean of every row, finished rows counting as full.
 * The notification bar uses this so it never restarts at 0% for the second file.
 */
export function queuePercent(state: QueueState): number {
  if (state.jobs.length === 0) {
    return 0;
  }
  const total = state.jobs.reduce((sum, job) => sum + Math.min(100, Math.max(0, job.progress)), 0);
  return Math.round(total / state.jobs.length);
}

/** True while the batch still has work: a running row or one waiting. */
export function hasPendingWork(state: QueueState): boolean {
  return state.jobs.some((job) => job.status === 'queued' || job.status === 'converting');
}

/** Whether Convert has anything to start. */
export function canStartQueue(state: QueueState): boolean {
  return state.jobs.some((job) => job.status === 'queued');
}

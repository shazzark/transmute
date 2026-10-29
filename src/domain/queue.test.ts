import { describe, expect, it } from 'vitest';

import type { Failure } from './errors';
import type { SourceFile } from './mediaFiles';
import {
  activeJob,
  canRetry,
  canStartQueue,
  hasPendingWork,
  initialQueueState,
  isCancellable,
  isTerminal,
  jobById,
  nextQueuedJob,
  positionOf,
  queueCounts,
  queuePercent,
  queueReducer,
  type QueueAction,
  type QueueState,
} from './queue';

const FAILURE: Failure = {
  code: 'engine-failed',
  title: 'Conversion failed',
  message: 'The engine stopped before writing a file.',
  recovery: 'Try again, or pick a different file.',
};

const OUTPUT = { name: 'Trip.mp4', path: '/cache/job/Trip.mp4' };

function source(name: string): SourceFile {
  return { path: `/cache/${name}`, name, sizeBytes: 1024, mimeType: 'video/mp4' };
}

function queueOf(...names: string[]): QueueState {
  return queueReducer(initialQueueState, {
    type: 'queue/added',
    sources: names.map(source),
  });
}

function run(state: QueueState, ...actions: readonly QueueAction[]): QueueState {
  return actions.reduce(queueReducer, state);
}

describe('queue/added', () => {
  it('queues every selected file in the order it was picked', () => {
    const state = queueOf('a.mp4', 'b.mp4', 'c.mp4');

    expect(state.jobs.map((job) => job.source.name)).toEqual(['a.mp4', 'b.mp4', 'c.mp4']);
    expect(state.jobs.map((job) => job.id)).toEqual(['job-1', 'job-2', 'job-3']);
    expect(state.jobs.every((job) => job.status === 'queued')).toBe(true);
    expect(state.jobs.every((job) => job.attempts === 0 && job.progress === 0)).toBe(true);
  });

  it('keeps numbering unique when a second batch is added', () => {
    const state = run(queueOf('a.mp4', 'b.mp4'), {
      type: 'queue/added',
      sources: [source('c.mp4')],
    });

    expect(state.jobs.map((job) => job.id)).toEqual(['job-1', 'job-2', 'job-3']);
  });

  it('does nothing when the picker returns no files', () => {
    const state = queueOf('a.mp4');
    expect(queueReducer(state, { type: 'queue/added', sources: [] })).toBe(state);
  });
});

describe('starting a row', () => {
  it('moves the first queued row to converting and counts the attempt', () => {
    const state = run(queueOf('a.mp4', 'b.mp4'), { type: 'queue/started', id: 'job-1' });

    expect(state.jobs[0]?.status).toBe('converting');
    expect(state.jobs[0]?.attempts).toBe(1);
    expect(state.jobs[1]?.status).toBe('queued');
  });

  it('refuses a second row while one is converting: one conversion at a time', () => {
    const state = run(
      queueOf('a.mp4', 'b.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/started', id: 'job-2' },
    );

    expect(state.jobs.map((job) => job.status)).toEqual(['converting', 'queued']);
    expect(activeJob(state)?.id).toBe('job-1');
  });

  it('ignores a start for a row that is not queued', () => {
    const state = run(
      queueOf('a.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
    );
    const afterRestart = queueReducer(state, { type: 'queue/started', id: 'job-1' });

    expect(afterRestart).toBe(state);
    expect(afterRestart.jobs[0]?.attempts).toBe(1);
  });
});

describe('progress', () => {
  it('never walks backwards and stops at 100', () => {
    const state = run(
      queueOf('a.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/progress', id: 'job-1', percent: 40, elapsedMs: 1000 },
      { type: 'queue/progress', id: 'job-1', percent: 30, elapsedMs: 1500 },
      { type: 'queue/progress', id: 'job-1', percent: 400, elapsedMs: 2000 },
    );

    expect(state.jobs[0]?.progress).toBe(100);
    expect(state.jobs[0]?.elapsedMs).toBe(2000);
  });

  it('keeps the last number while a file of unknown length is running', () => {
    const state = run(
      queueOf('a.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/progress', id: 'job-1', percent: 20, elapsedMs: 500 },
      { type: 'queue/progress', id: 'job-1', percent: null, elapsedMs: 900 },
    );

    expect(state.jobs[0]?.progress).toBe(20);
    expect(state.jobs[0]?.indeterminate).toBe(true);
  });

  it('changes nothing for a row that is not converting', () => {
    const state = queueOf('a.mp4');
    expect(
      queueReducer(state, { type: 'queue/progress', id: 'job-1', percent: 50, elapsedMs: 1 }),
    ).toBe(state);
  });
});

describe('terminal states', () => {
  it('completes a row at 100% with its output', () => {
    const state = run(
      queueOf('a.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
    );

    expect(state.jobs[0]?.status).toBe('complete');
    expect(state.jobs[0]?.progress).toBe(100);
    expect(state.jobs[0]?.output).toEqual(OUTPUT);
    expect(activeJob(state)).toBeNull();
  });

  it('records a failure with its reason and leaves the queue able to continue', () => {
    const state = run(
      queueOf('a.mp4', 'b.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/failed', id: 'job-1', failure: FAILURE },
    );

    expect(state.jobs[0]?.status).toBe('failed');
    expect(state.jobs[0]?.failure).toEqual(FAILURE);
    expect(nextQueuedJob(state)?.id).toBe('job-2');
    expect(canStartQueue(state)).toBe(true);
  });

  it('cannot be rewritten by late progress or a late completion', () => {
    const failed = run(
      queueOf('a.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/failed', id: 'job-1', failure: FAILURE },
    );
    const afterLateEvents = run(
      failed,
      { type: 'queue/progress', id: 'job-1', percent: 90, elapsedMs: 5000 },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
    );

    expect(afterLateEvents).toBe(failed);
    expect(afterLateEvents.jobs[0]?.status).toBe('failed');
  });
});

describe('cancelling', () => {
  it('cancels a queued row so it never starts', () => {
    const state = run(queueOf('a.mp4', 'b.mp4', 'c.mp4'), {
      type: 'queue/cancelled',
      id: 'job-2',
    });

    expect(state.jobs[1]?.status).toBe('cancelled');
    expect(nextQueuedJob(state)?.id).toBe('job-1');
    expect(state.stopRequested).toBe(false);

    const running = run(
      state,
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
    );
    // The cancelled row is skipped: the batch moves straight to job-3.
    expect(nextQueuedJob(running)?.id).toBe('job-3');
  });

  it('marks the active row as requested before the engine has stopped', () => {
    const state = run(
      queueOf('a.mp4', 'b.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/cancelRequested', id: 'job-1' },
    );

    // Still converting: the row must not claim to have stopped yet (TR-11).
    expect(state.jobs[0]?.status).toBe('converting');
    expect(state.jobs[0]?.cancelRequested).toBe(true);
  });

  it('settles the active row as cancelled and leaves the rest of the queue alone', () => {
    const state = run(
      queueOf('a.mp4', 'b.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/cancelRequested', id: 'job-1' },
      { type: 'queue/cancelled', id: 'job-1' },
    );

    expect(state.jobs[0]?.status).toBe('cancelled');
    expect(state.jobs[0]?.cancelRequested).toBe(false);
    expect(state.jobs[1]?.status).toBe('queued');
    // A per-row cancel is about that row; the batch continues with the next one.
    expect(canStartQueue(state)).toBe(true);
  });

  it('refuses a cancel that arrives twice', () => {
    const once = run(queueOf('a.mp4'), { type: 'queue/cancelled', id: 'job-1' });
    expect(queueReducer(once, { type: 'queue/cancelled', id: 'job-1' })).toBe(once);
  });

  it('removes only queued rows so the runner skips them permanently', () => {
    const state = queueOf('a.mp4', 'b.mp4');
    const removed = queueReducer(state, { type: 'queue/removed', id: 'job-1' });
    expect(removed.jobs.map((job) => job.id)).toEqual(['job-2']);
    expect(nextQueuedJob(removed)?.id).toBe('job-2');
    expect(queueReducer(removed, { type: 'queue/removed', id: 'job-2' }).jobs).toEqual([]);
  });

  it('does not remove a row after the runner has claimed it', () => {
    const running = run(queueOf('a.mp4'), { type: 'queue/started', id: 'job-1' });
    expect(queueReducer(running, { type: 'queue/removed', id: 'job-1' })).toBe(running);
  });
});

describe('retrying', () => {
  it('puts a failed row back in line with a clean slate', () => {
    const failed = run(
      queueOf('a.mp4', 'b.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/progress', id: 'job-1', percent: 60, elapsedMs: 4000 },
      { type: 'queue/failed', id: 'job-1', failure: FAILURE },
    );

    const retried = queueReducer(failed, { type: 'queue/retried', id: 'job-1' });

    expect(retried.jobs[0]?.status).toBe('queued');
    expect(retried.jobs[0]?.failure).toBeNull();
    expect(retried.jobs[0]?.progress).toBe(0);
    expect(retried.jobs[0]?.elapsedMs).toBe(0);
    // The retried row keeps its place in the batch, and its history.
    expect(positionOf(retried, 'job-1')).toBe(1);
    expect(retried.jobs[0]?.attempts).toBe(1);

    const restarted = queueReducer(retried, { type: 'queue/started', id: 'job-1' });
    expect(restarted.jobs[0]?.attempts).toBe(2);
  });

  it('also rescues a row the user cancelled by mistake', () => {
    const cancelled = run(queueOf('a.mp4'), { type: 'queue/cancelled', id: 'job-1' });
    const retried = queueReducer(cancelled, { type: 'queue/retried', id: 'job-1' });

    expect(retried.jobs[0]?.status).toBe('queued');
  });

  it('refuses to retry a row that has not finished', () => {
    const state = run(queueOf('a.mp4'), { type: 'queue/started', id: 'job-1' });
    expect(queueReducer(state, { type: 'queue/retried', id: 'job-1' })).toBe(state);
  });
});

describe('cancel all', () => {
  it('cancels every waiting row and asks the running one to stop', () => {
    const state = run(
      queueOf('a.mp4', 'b.mp4', 'c.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/cancelAll' },
    );

    expect(state.jobs.map((job) => job.status)).toEqual(['converting', 'cancelled', 'cancelled']);
    expect(state.stopRequested).toBe(true);
    expect(state.jobs[0]?.cancelRequested).toBe(true);
  });

  it('starts nothing while stopped, and Convert lifts the stop', () => {
    const stopped = run(
      queueOf('a.mp4', 'b.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/cancelAll' },
      { type: 'queue/cancelled', id: 'job-1' },
      { type: 'queue/retried', id: 'job-2' },
    );

    const blocked = queueReducer(stopped, { type: 'queue/started', id: 'job-2' });
    expect(blocked).toBe(stopped);

    const allowed = run(blocked, { type: 'queue/runRequested' });
    expect(allowed.stopRequested).toBe(false);
    expect(run(allowed, { type: 'queue/started', id: 'job-2' }).jobs[1]?.status).toBe('converting');
  });

  it('does not arm the stop when nothing was running', () => {
    const state = run(queueOf('a.mp4', 'b.mp4'), { type: 'queue/cancelAll' });

    expect(state.jobs.map((job) => job.status)).toEqual(['cancelled', 'cancelled']);
    expect(state.stopRequested).toBe(false);
  });

  it('leaves a batch with nothing to cancel unchanged', () => {
    const finished = run(
      queueOf('a.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
    );

    expect(queueReducer(finished, { type: 'queue/cancelAll' })).toBe(finished);
  });
});

describe('clearing finished rows', () => {
  it('keeps only the rows that still need work', () => {
    const state = run(
      queueOf('a.mp4', 'b.mp4', 'c.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
      { type: 'queue/cancelled', id: 'job-2' },
      { type: 'queue/cleared' },
    );

    expect(state.jobs.map((job) => job.id)).toEqual(['job-3']);
    expect(state.nextNumber).toBe(4);
  });
});

describe('the format belongs to the batch', () => {
  it('applies a new format while nothing is converting', () => {
    const state = queueOf('a.mp4');
    const changed = queueReducer(state, { type: 'queue/presetSelected', presetId: 'mkv' });
    expect(changed.presetId).toBe('mkv');
  });

  it('refuses one mid-run, so a batch is never half in each container', () => {
    const state = run(queueOf('a.mp4'), { type: 'queue/started', id: 'job-1' });
    expect(queueReducer(state, { type: 'queue/presetSelected', presetId: 'mkv' })).toBe(state);
  });
});

describe('selectors', () => {
  it('answers what is running and what is next', () => {
    const idle = queueOf('a.mp4', 'b.mp4');
    expect(activeJob(idle)).toBeNull();
    expect(nextQueuedJob(idle)?.id).toBe('job-1');

    const running = run(idle, { type: 'queue/started', id: 'job-1' });
    expect(activeJob(running)?.id).toBe('job-1');
    expect(nextQueuedJob(running)?.id).toBe('job-2');
    expect(jobById(running, 'job-2')?.source.name).toBe('b.mp4');
    expect(jobById(running, 'job-9')).toBeNull();
  });

  it('counts every status and knows whether work is left', () => {
    const state = run(
      queueOf('a.mp4', 'b.mp4', 'c.mp4', 'd.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
      { type: 'queue/started', id: 'job-2' },
      { type: 'queue/failed', id: 'job-2', failure: FAILURE },
      { type: 'queue/cancelled', id: 'job-3' },
    );

    expect(queueCounts(state)).toEqual({
      total: 4,
      queued: 1,
      converting: 0,
      complete: 1,
      failed: 1,
      cancelled: 1,
    });
    expect(hasPendingWork(state)).toBe(true);
    expect(canStartQueue(state)).toBe(true);
  });

  it('reports batch progress as the mean, so the bar never restarts', () => {
    expect(queuePercent(queueOf())).toBe(0);

    const state = run(
      queueOf('a.mp4', 'b.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
      { type: 'queue/started', id: 'job-2' },
      { type: 'queue/progress', id: 'job-2', percent: 40, elapsedMs: 100 },
    );

    // 100% for the finished row, 40% for the running one.
    expect(queuePercent(state)).toBe(70);
  });

  it('places a row in the batch, and admits when it is not there', () => {
    const state = queueOf('a.mp4', 'b.mp4', 'c.mp4');
    expect(positionOf(state, 'job-3')).toBe(3);
    expect(positionOf(state, 'job-9')).toBe(0);
  });

  it('says what the screen may offer for a row', () => {
    const state = run(
      queueOf('a.mp4', 'b.mp4', 'c.mp4'),
      { type: 'queue/started', id: 'job-1' },
      { type: 'queue/completed', id: 'job-1', output: OUTPUT },
      { type: 'queue/cancelled', id: 'job-2' },
    );
    const done = state.jobs[0]!;
    const cancelled = state.jobs[1]!;
    const queued = state.jobs[2]!;

    expect(isTerminal(done.status)).toBe(true);
    expect(isTerminal(queued.status)).toBe(false);
    expect(isCancellable(queued)).toBe(true);
    expect(isCancellable(done)).toBe(false);
    expect(canRetry(cancelled)).toBe(true);
    expect(canRetry(done)).toBe(false);
  });

  it('keeps the chosen format across a reset but forgets the rows', () => {
    const state = run(
      queueOf('a.mp4'),
      { type: 'queue/presetSelected', presetId: 'mkv' },
      { type: 'queue/reset' },
    );

    expect(state.jobs).toEqual([]);
    expect(state.presetId).toBe('mkv');
    expect(state.nextNumber).toBe(1);
    expect(canStartQueue(state)).toBe(false);
  });
});

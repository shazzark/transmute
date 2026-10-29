import { describe, expect, it, vi } from 'vitest';

import type { QueueJob } from '../domain/queue';
import type { ConversionResult } from './runConversion';
import { runQueue } from './runQueue';

function job(id: string, name = `${id}.mp4`): QueueJob {
  return {
    id,
    source: { path: `/cache/${name}`, name, sizeBytes: 1024, mimeType: 'video/mp4' },
    status: 'queued',
    progress: 0,
    indeterminate: true,
    elapsedMs: 0,
    output: null,
    failure: null,
    attempts: 0,
    cancelRequested: false,
  };
}

const DONE: ConversionResult = {
  status: 'done',
  summary: null,
  outputPath: '/cache/job/out.mp4',
  failure: null,
};

const FAILED: ConversionResult = {
  status: 'failed',
  summary: null,
  outputPath: null,
  failure: {
    code: 'engine-failed',
    title: 'Conversion failed',
    message: 'The engine stopped.',
    recovery: 'Try again.',
  },
};

const CANCELLED: ConversionResult = {
  status: 'cancelled',
  summary: null,
  outputPath: null,
  failure: null,
};

/** A source of rows that keeps handing out what has not been taken yet. */
function inLine(...ids: string[]): { nextJob: () => QueueJob | null; remaining: string[] } {
  const remaining = [...ids];
  return {
    remaining,
    nextJob: () => {
      const id = remaining.shift();
      return id === undefined ? null : job(id);
    },
  };
}

describe('runQueue', () => {
  it('runs the rows in the order they were queued', async () => {
    const line = inLine('job-1', 'job-2', 'job-3');
    const order: string[] = [];

    const summary = await runQueue({
      nextJob: line.nextJob,
      convert: async (row) => {
        order.push(row.id);
        return DONE;
      },
    });

    expect(order).toEqual(['job-1', 'job-2', 'job-3']);
    expect(summary).toEqual({ processed: 3, stalled: false });
  });

  it('never runs two rows at the same time', async () => {
    const line = inLine('job-1', 'job-2', 'job-3');
    let active = 0;
    let peak = 0;

    await runQueue({
      nextJob: line.nextJob,
      convert: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return DONE;
      },
    });

    expect(peak).toBe(1);
  });

  it('carries on after a failed row, keeping each reason with its row', async () => {
    const line = inLine('job-1', 'job-2');
    const finished: { id: string; status: ConversionResult['status'] }[] = [];

    const summary = await runQueue({
      nextJob: line.nextJob,
      convert: async (row) => (row.id === 'job-1' ? FAILED : DONE),
      onFinished: (row, result) => finished.push({ id: row.id, status: result.status }),
    });

    expect(finished).toEqual([
      { id: 'job-1', status: 'failed' },
      { id: 'job-2', status: 'done' },
    ]);
    expect(summary.processed).toBe(2);
  });

  it('turns an exception into a failed row instead of ending the batch', async () => {
    const line = inLine('job-1', 'job-2');
    const finished: ConversionResult[] = [];

    const summary = await runQueue({
      nextJob: line.nextJob,
      convert: async (row) => {
        if (row.id === 'job-1') {
          throw new Error('bridge exploded');
        }
        return DONE;
      },
      onFinished: (_row, result) => finished.push(result),
    });

    expect(finished.map((result) => result.status)).toEqual(['failed', 'done']);
    expect(finished[0]?.failure?.detail).toBe('bridge exploded');
    expect(summary).toEqual({ processed: 2, stalled: false });
  });

  it('stops asking once the queue has nothing left, including after a cancel', async () => {
    const nextJob = vi
      .fn<() => QueueJob | null>()
      .mockReturnValueOnce(job('job-1'))
      .mockReturnValue(null);

    const summary = await runQueue({ nextJob, convert: async () => CANCELLED });

    expect(summary).toEqual({ processed: 1, stalled: false });
    // Called twice: once for the row, once to learn the queue is done.
    expect(nextJob).toHaveBeenCalledTimes(2);
  });

  it('stops when the same row comes back, rather than re-encoding it forever', async () => {
    const convert = vi.fn(async () => DONE);

    const summary = await runQueue({ nextJob: () => job('job-1'), convert });

    expect(summary).toEqual({ processed: 1, stalled: true });
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it('reports a start before the conversion begins', async () => {
    const line = inLine('job-1');
    const events: string[] = [];

    await runQueue({
      nextJob: line.nextJob,
      onStarted: (row) => events.push(`started:${row.id}`),
      convert: async (row) => {
        events.push(`converting:${row.id}`);
        return DONE;
      },
      onFinished: (row) => events.push(`finished:${row.id}`),
    });

    expect(events).toEqual(['started:job-1', 'converting:job-1', 'finished:job-1']);
  });

  it('does nothing for an empty queue', async () => {
    const convert = vi.fn(async () => DONE);
    const summary = await runQueue({ nextJob: () => null, convert });

    expect(summary).toEqual({ processed: 0, stalled: false });
    expect(convert).not.toHaveBeenCalled();
  });
});

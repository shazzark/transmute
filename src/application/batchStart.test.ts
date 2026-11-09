import { describe, expect, it } from 'vitest';

import { initialQueueState, queueReducer } from '../domain/queue';
import { decideBatchStart } from './batchStart';

const oneQueued = queueReducer(initialQueueState, {
  type: 'queue/added',
  sources: [{ path: '/cache/one.mp4', name: 'one.mp4', sizeBytes: 1, mimeType: 'video/mp4' }],
});

describe('decideBatchStart', () => {
  it('starts queued work without consulting notification state', () => {
    expect(decideBatchStart(oneQueued, false)).toEqual({ start: true, batchSize: 1 });
  });

  it('refuses a second tap while the first batch owns the runner', () => {
    expect(decideBatchStart(oneQueued, true)).toEqual({ start: false, reason: 'already-running' });
  });

  it('recognizes a converting row even when a new screen instance has no local guard', () => {
    const converting = queueReducer(oneQueued, { type: 'queue/started', id: 'job-1' });
    expect(decideBatchStart(converting, false)).toEqual({ start: false, reason: 'already-running' });
  });

  it('does not start an empty queue', () => {
    expect(decideBatchStart(initialQueueState, false)).toEqual({ start: false, reason: 'nothing-queued' });
  });

  it('sizes the new batch from queued work, ignoring completed and cancelled rows', () => {
    const settled = queueReducer(oneQueued, { type: 'queue/started', id: 'job-1' });
    const completed = queueReducer(settled, {
      type: 'queue/completed',
      id: 'job-1',
      output: { name: 'one.mp4', path: '/results/one.mp4' },
    });
    const withCancelled = queueReducer(completed, {
      type: 'queue/added',
      sources: [{ path: '/cache/cancelled.mp4', name: 'cancelled.mp4', sizeBytes: 1, mimeType: 'video/mp4' }],
    });
    const cancelled = queueReducer(withCancelled, { type: 'queue/cancelled', id: 'job-2' });
    const withNext = queueReducer(cancelled, {
      type: 'queue/added',
      sources: [{ path: '/cache/next.mp4', name: 'next.mp4', sizeBytes: 1, mimeType: 'video/mp4' }],
    });

    expect(decideBatchStart(withNext, false)).toEqual({ start: true, batchSize: 1 });
  });
});

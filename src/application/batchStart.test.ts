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
});

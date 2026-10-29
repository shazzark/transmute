import { describe, expect, it, vi } from 'vitest';

import { recoverInterruptedJob } from './recoverInterrupted';

describe('recoverInterruptedJob', () => {
  it('cleans leftover outputs before clearing an interrupted marker', async () => {
    const order: string[] = [];
    await expect(recoverInterruptedJob({
      hasActiveMarker: async () => true,
      removePartialOutputs: async () => { order.push('outputs'); },
      clearActiveMarker: async () => { order.push('marker'); },
    })).resolves.toBe(true);
    expect(order).toEqual(['outputs', 'marker']);
  });

  it('leaves outputs alone when no conversion was interrupted', async () => {
    const removePartialOutputs = vi.fn(async () => {});
    const clearActiveMarker = vi.fn(async () => {});
    await expect(recoverInterruptedJob({
      hasActiveMarker: async () => false,
      removePartialOutputs,
      clearActiveMarker,
    })).resolves.toBe(false);
    expect(removePartialOutputs).not.toHaveBeenCalled();
    expect(clearActiveMarker).not.toHaveBeenCalled();
  });

  it('keeps the marker if cleanup fails so recovery can be retried', async () => {
    const clearActiveMarker = vi.fn(async () => {});
    await expect(recoverInterruptedJob({
      hasActiveMarker: async () => true,
      removePartialOutputs: async () => { throw new Error('storage unavailable'); },
      clearActiveMarker,
    })).rejects.toThrow('storage unavailable');
    expect(clearActiveMarker).not.toHaveBeenCalled();
  });
});

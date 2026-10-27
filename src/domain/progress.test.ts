import { describe, expect, it } from 'vitest';

import { formatElapsed, progressFromStatistics } from './progress';

describe('progressFromStatistics', () => {
  it('computes whole percent from processed time over duration', () => {
    expect(progressFromStatistics(0, 5000, 20000)).toEqual({
      percent: 25,
      processedMs: 5000,
      indeterminate: false,
    });
  });

  it('never decreases when a statistics tick arrives out of order', () => {
    const first = progressFromStatistics(0, 15000, 20000);
    const second = progressFromStatistics(first.percent ?? 0, 4000, 20000);

    expect(first.percent).toBe(75);
    expect(second.percent).toBe(75);
  });

  it('clamps at 100 instead of overshooting', () => {
    expect(progressFromStatistics(98, 25000, 20000).percent).toBe(100);
  });

  it('is indeterminate when the duration is unknown or zero', () => {
    expect(progressFromStatistics(12, 4000, undefined)).toEqual({
      percent: null,
      processedMs: 4000,
      indeterminate: true,
    });
    expect(progressFromStatistics(12, 4000, 0).percent).toBeNull();
  });

  it('replaces NaN and negative counters with zero rather than leaking them', () => {
    const nan = progressFromStatistics(0, Number.NaN, 20000);
    const negative = progressFromStatistics(0, -50, 20000);

    expect(nan.percent).toBe(0);
    expect(negative.percent).toBe(0);
    expect(Number.isNaN(nan.processedMs)).toBe(false);
  });

  it('ignores a garbage previous value', () => {
    expect(progressFromStatistics(Number.NaN, 10000, 20000).percent).toBe(50);
  });
});

describe('formatElapsed', () => {
  it('formats minutes and seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(9_000)).toBe('0:09');
    expect(formatElapsed(133_000)).toBe('2:13');
  });

  it('adds the hour field only when needed', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });

  it('never shows a negative or NaN clock', () => {
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(Number.NaN)).toBe('0:00');
  });
});

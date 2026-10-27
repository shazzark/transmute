import { describe, expect, it } from 'vitest';

import { formatBytes, metadataLine } from './format';

describe('formatBytes', () => {
  it('uses bytes below one thousand', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('scales to kB, MB, and GB', () => {
    expect(formatBytes(1_000)).toBe('1.0 kB');
    expect(formatBytes(12_345_678)).toBe('12.3 MB');
    expect(formatBytes(4_500_000_000)).toBe('4.5 GB');
  });

  it('drops the decimal for three-digit values', () => {
    expect(formatBytes(123_000_000)).toBe('123 MB');
  });

  it('returns null for unknown sizes instead of guessing', () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(undefined)).toBeNull();
    expect(formatBytes(-1)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
  });
});

describe('metadataLine', () => {
  it('joins known parts with a middle dot', () => {
    expect(metadataLine(['12.3 MB', '0:30', 'h264'])).toBe('12.3 MB · 0:30 · h264');
  });

  it('skips empty and unknown parts', () => {
    expect(metadataLine(['12.3 MB', null, '', undefined, 'aac'])).toBe('12.3 MB · aac');
  });

  it('returns an empty string when nothing is known', () => {
    expect(metadataLine([null, undefined])).toBe('');
  });
});

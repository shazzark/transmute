import { describe, expect, it } from 'vitest';

import { containerLabel, extensionLabel, formatBytes, metadataLine, resolutionLabel } from './format';

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

describe('extensionLabel', () => {
  it('reads the extension from a file name', () => {
    expect(extensionLabel('Trip 2026.MOV')).toBe('MOV');
    expect(extensionLabel('clip.3gp')).toBe('3GP');
    expect(extensionLabel('/cache/picked.mkv')).toBe('MKV');
  });

  it('returns null when there is nothing usable to show', () => {
    expect(extensionLabel(null)).toBeNull();
    expect(extensionLabel(undefined)).toBeNull();
    expect(extensionLabel('holiday')).toBeNull();
    expect(extensionLabel('.hidden')).toBeNull();
    expect(extensionLabel('trailing.')).toBeNull();
    expect(extensionLabel('odd.extension')).toBeNull();
  });
});

describe('containerLabel', () => {
  it('collapses FFprobe container families to the first name', () => {
    expect(containerLabel('mov,mp4,m4a,3gp,3g2,mj2')).toBe('MOV');
    expect(containerLabel('matroska,webm')).toBe('MATROSKA');
    expect(containerLabel('mp3')).toBe('MP3');
  });

  it('returns null for missing or blank values', () => {
    expect(containerLabel(null)).toBeNull();
    expect(containerLabel(undefined)).toBeNull();
    expect(containerLabel(' , ')).toBeNull();
  });
});

describe('resolutionLabel', () => {
  it('joins known dimensions', () => {
    expect(resolutionLabel(1080, 1920)).toBe('1080×1920');
  });

  it('returns null while either side is unknown', () => {
    expect(resolutionLabel(null, 1920)).toBeNull();
    expect(resolutionLabel(1080, null)).toBeNull();
    expect(resolutionLabel(0, 1920)).toBeNull();
    expect(resolutionLabel(Number.NaN, 1920)).toBeNull();
  });
});

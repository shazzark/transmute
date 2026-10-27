import { describe, expect, it } from 'vitest';

import { formatDuration, summariseProbe, type RawProbeInformation } from './probe';

/**
 * Fixtures are hand-written copies of real FFprobe JSON shapes: numbers arrive
 * as strings, and fields the container does not expose are simply absent.
 */
const mp4Report: RawProbeInformation = {
  format: { duration: '12.345000', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, duration: '12.345000' },
    { codec_type: 'audio', codec_name: 'aac' },
  ],
};

describe('summariseProbe', () => {
  it('reads duration, container, codecs, and frame size from a normal MP4', () => {
    const summary = summariseProbe(mp4Report);

    expect(summary).toEqual({
      durationMs: 12345,
      durationLabel: '0:12',
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1080,
      height: 1920,
      hasVideo: true,
      hasAudio: true,
    });
  });

  it('falls back to the video stream duration when the format has none', () => {
    const summary = summariseProbe({
      streams: [{ codec_type: 'video', codec_name: 'hevc', duration: '4.5', width: 720, height: 480 }],
    });

    expect(summary.durationMs).toBe(4500);
    expect(summary.container).toBeNull();
  });

  it('reports unknown duration as null instead of zero', () => {
    const summary = summariseProbe({
      format: { duration: 'N/A' },
      streams: [{ codec_type: 'video', codec_name: 'mpeg4' }],
    });

    expect(summary.durationMs).toBeNull();
    expect(summary.durationLabel).toBeNull();
    expect(summary.width).toBeNull();
    expect(summary.hasAudio).toBe(false);
  });

  it('survives a report with no streams at all', () => {
    const summary = summariseProbe({});

    expect(summary.hasVideo).toBe(false);
    expect(summary.hasAudio).toBe(false);
    expect(summary.durationMs).toBeNull();
  });

  it('survives null and undefined', () => {
    expect(summariseProbe(null).hasVideo).toBe(false);
    expect(summariseProbe(undefined).videoCodec).toBeNull();
  });

  it('ignores unusable numeric fields', () => {
    const summary = summariseProbe({
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 0, height: -20 }],
    });

    expect(summary.width).toBeNull();
    expect(summary.height).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatDuration(5_000)).toBe('0:05');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });

  it('returns null for missing or non-positive durations', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-1)).toBeNull();
  });
});

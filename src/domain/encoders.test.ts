import { describe, expect, it } from 'vitest';

import { chooseVideoEncoder, meetsHardwareMinimum, pixelFormatFor } from './encoders';
import { getPreset } from './presets';

const mp4 = getPreset('mp4');

describe('chooseVideoEncoder', () => {
  it('prefers the hardware encoder when the build has it', () => {
    const choice = chooseVideoEncoder(mp4, ['libopenh264', 'h264_mediacodec', 'aac']);

    expect(choice).toEqual({
      ok: true,
      encoder: 'h264_mediacodec',
      hardware: true,
      pixelFormat: 'nv12',
    });
  });

  it('falls back to the software encoder and says so through the pixel format', () => {
    const choice = chooseVideoEncoder(mp4, ['libopenh264']);

    expect(choice.ok).toBe(true);
    if (choice.ok) {
      expect(choice.encoder).toBe('libopenh264');
      expect(choice.hardware).toBe(false);
      expect(choice.pixelFormat).toBe('yuv420p');
    }
  });

  it('fails specifically when no candidate exists', () => {
    const choice = chooseVideoEncoder(mp4, ['mpeg4', 'libx264']);

    expect(choice.ok).toBe(false);
    if (!choice.ok) {
      expect(choice.candidates).toContain('h264_mediacodec');
      expect(choice.reason).toMatch(/no MP4 video encoder/i);
      expect(choice.reason).toMatch(/h264_mediacodec/);
    }
  });

  it('reports that an audio preset needs no video encoder', () => {
    const choice = chooseVideoEncoder(getPreset('mp3'), ['libmp3lame']);

    expect(choice.ok).toBe(false);
    if (!choice.ok) {
      expect(choice.reason).toMatch(/no video encoder/i);
    }
  });

  it('maps encoder names to pixel formats', () => {
    expect(pixelFormatFor('h264_mediacodec')).toBe('nv12');
    expect(pixelFormatFor('hevc_mediacodec')).toBe('nv12');
    expect(pixelFormatFor('libopenh264')).toBe('yuv420p');
  });
});

describe('meetsHardwareMinimum', () => {
  it('accepts exactly 176×144 and above', () => {
    expect(meetsHardwareMinimum(176, 144)).toBe(true);
    expect(meetsHardwareMinimum(1920, 1080)).toBe(true);
  });

  it('rejects anything smaller', () => {
    expect(meetsHardwareMinimum(175, 144)).toBe(false);
    expect(meetsHardwareMinimum(176, 143)).toBe(false);
  });

  it('does not guess when dimensions are unknown', () => {
    expect(meetsHardwareMinimum(undefined, undefined)).toBe(true);
  });
});

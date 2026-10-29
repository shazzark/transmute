import { describe, expect, it } from 'vitest';

import {
  chooseAudioEncoder,
  chooseVideoEncoder,
  meetsHardwareMinimum,
  pixelFormatFor,
  resolveAvailability,
} from './encoders';
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

describe('chooseAudioEncoder', () => {
  it('accepts the preset codec when the build has it', () => {
    expect(chooseAudioEncoder(getPreset('mp3'), ['libmp3lame', 'aac'])).toEqual({
      ok: true,
      encoder: 'libmp3lame',
    });
  });

  it('fails by name when the build lacks the codec', () => {
    const choice = chooseAudioEncoder(getPreset('wav'), ['libmp3lame', 'aac']);

    expect(choice.ok).toBe(false);
    if (!choice.ok) {
      expect(choice.candidates).toEqual(['pcm_s16le']);
      expect(choice.reason).toMatch(/no WAV audio encoder/i);
      expect(choice.reason).toMatch(/pcm_s16le/);
    }
  });

  it('reports that a preset with no audio track has nothing to choose', () => {
    const silent = { ...getPreset('mp4'), audioCodec: null };
    const choice = chooseAudioEncoder(silent, ['aac']);

    expect(choice.ok).toBe(false);
    if (!choice.ok) {
      expect(choice.reason).toMatch(/no audio track/i);
      expect(choice.candidates).toEqual([]);
    }
  });
});

describe('resolveAvailability', () => {
  it('keeps formats disabled with a reason while the build is unknown', () => {
    expect(resolveAvailability(getPreset('webm'), null)).toEqual({
      available: false,
      reason: 'This build’s encoder support could not be checked.',
    });
  });

  it('enables a format whose encoder the build reports', () => {
    const availability = resolveAvailability(getPreset('mkv'), ['h264_mediacodec', 'aac']);

    expect(availability).toEqual({ available: true, reason: '' });
  });

  it('disables a video format whose encoder is missing', () => {
    const availability = resolveAvailability(getPreset('webm'), ['h264_mediacodec', 'aac']);

    expect(availability.available).toBe(false);
    expect(availability.reason).toMatch(/not in this build/i);
  });

  it('disables an audio format whose encoder is missing', () => {
    const availability = resolveAvailability(getPreset('flac'), ['h264_mediacodec', 'aac']);

    expect(availability.available).toBe(false);
    expect(availability.reason).toMatch(/not in this build/i);
  });

  it('judges each format on its own codec', () => {
    const build = ['libopenh264', 'aac', 'libmp3lame'];

    expect(resolveAvailability(getPreset('mp4'), build).available).toBe(true);
    expect(resolveAvailability(getPreset('m4a'), build).available).toBe(true);
    expect(resolveAvailability(getPreset('mp3'), build).available).toBe(true);
    expect(resolveAvailability(getPreset('wav'), build).available).toBe(false);
    expect(resolveAvailability(getPreset('webm'), build).available).toBe(false);
  });

  it('disables formats when the selected input lacks the required stream', () => {
    const build = ['h264_mediacodec', 'aac', 'libmp3lame'];
    expect(resolveAvailability(getPreset('mp4'), build, { hasVideo: false, hasAudio: true })).toEqual({
      available: false,
      reason: 'This input has no video stream.',
    });
    expect(resolveAvailability(getPreset('mp3'), build, { hasVideo: true, hasAudio: false })).toEqual({
      available: false,
      reason: 'This input has no audio stream.',
    });
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

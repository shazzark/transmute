import { describe, expect, it } from 'vitest';

import { DEFAULT_PRESET_ID, getPreset, PRESETS, type PresetId } from './presets';

describe('preset catalogue', () => {
  it('offers four video containers and six audio targets', () => {
    expect(PRESETS.filter((preset) => preset.kind === 'video').map((preset) => preset.label)).toEqual([
      'MP4',
      'MKV',
      'MOV',
      'WEBM',
    ]);
    expect(PRESETS.filter((preset) => preset.kind === 'audio').map((preset) => preset.label)).toEqual([
      'MP3',
      'M4A',
      'WAV',
      'FLAC',
      'OGG',
      'OPUS',
    ]);
  });

  it('keeps ids, labels and extensions unique', () => {
    const ids = PRESETS.map((preset) => preset.id);
    const labels = PRESETS.map((preset) => preset.label);
    const extensions = PRESETS.map((preset) => preset.extension);

    expect(new Set(ids).size).toBe(PRESETS.length);
    expect(new Set(labels).size).toBe(PRESETS.length);
    expect(new Set(extensions).size).toBe(PRESETS.length);
  });

  it('gives every preset a usable extension, label and plain-word detail', () => {
    for (const preset of PRESETS) {
      expect(preset.extension).toMatch(/^\.[a-z0-9]+$/);
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.detail.length).toBeGreaterThan(0);
      expect(preset.container.length).toBeGreaterThan(0);
    }
  });

  it('gives video presets an encoder ladder and an audio codec', () => {
    for (const preset of PRESETS.filter((candidate) => candidate.kind === 'video')) {
      expect(preset.videoEncoderCandidates.length).toBeGreaterThan(0);
      expect(preset.audioCodec).not.toBeNull();
      expect(preset.videoBitrate).not.toBeNull();
    }
  });

  it('gives audio presets one codec and no video settings', () => {
    for (const preset of PRESETS.filter((candidate) => candidate.kind === 'audio')) {
      expect(preset.videoEncoderCandidates).toEqual([]);
      expect(preset.audioCodec).not.toBeNull();
      expect(preset.videoBitrate).toBeNull();
    }
  });

  it('resolves every known id back to its preset', () => {
    for (const preset of PRESETS) {
      expect(getPreset(preset.id)).toBe(preset);
    }
  });

  it('starts new jobs on MP4', () => {
    expect(getPreset(DEFAULT_PRESET_ID).label).toBe('MP4');
  });

  it('rejects an unknown id instead of guessing', () => {
    expect(() => getPreset('avi' as PresetId)).toThrow(/Unknown preset/);
  });
});

describe('preset commands', () => {
  it('names only WebM as needing container-specific video arguments', () => {
    const withExtra = PRESETS.filter((preset) => (preset.extraVideoArgs?.length ?? 0) > 0);

    expect(withExtra.map((preset) => preset.id)).toEqual(['webm']);
    expect(withExtra[0]?.extraVideoArgs).toContain('-deadline');
  });
});

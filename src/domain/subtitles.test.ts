import { describe, expect, it } from 'vitest';

import { getPreset, PRESETS } from './presets';
import {
  detectSidecarFormat,
  resolveSubtitleAvailability,
  subtitleCodecFor,
  subtitleDemuxerFor,
  subtitleOutputName,
  subtitleTargetFor,
  subtitleTrackLabel,
  SUBTITLE_CONTAINERS,
  validateSrt,
  validateSidecar,
} from './subtitles';

/** A normal two-cue file, exactly as a subtitle editor writes it. */
const SRT = [
  '1',
  '00:00:00,000 --> 00:00:02,500',
  'First line',
  '',
  '2',
  '00:00:12,480 --> 00:00:15,000',
  'Second line',
  'and a continuation',
  '',
].join('\r\n');

describe('detectSidecarFormat', () => {
  it('accepts SubRip whatever the case or surrounding spaces', () => {
    expect(detectSidecarFormat('Trip.srt')).toBe('srt');
    expect(detectSidecarFormat('TRIP.SRT')).toBe('srt');
    expect(detectSidecarFormat('  Trip 2026.Srt  ')).toBe('srt');
  });

  it('refuses everything else by returning null', () => {
    expect(detectSidecarFormat('Trip.vtt')).toBeNull();
    expect(detectSidecarFormat('Trip.ass')).toBeNull();
    expect(detectSidecarFormat('Trip.mp4')).toBeNull();
    expect(detectSidecarFormat('srt')).toBeNull();
    expect(detectSidecarFormat('')).toBeNull();
  });
});

describe('codec and demuxer names', () => {
  it('writes the container-agnostic text codec names', () => {
    expect(subtitleCodecFor('srt')).toBe('srt');
    expect(subtitleCodecFor('vtt')).toBe('webvtt');
  });

  it('forces the SubRip demuxer for a sidecar', () => {
    expect(subtitleDemuxerFor('srt')).toBe('srt');
  });
});

describe('validateSrt', () => {
  it('counts cues and reports the span they cover', () => {
    const result = validateSrt(SRT);

    expect(result).toEqual({
      ok: true,
      cueCount: 2,
      firstCueLabel: '0:00',
      lastCueLabel: '0:15',
    });
  });

  it('ignores a byte-order mark and accepts files without cue numbers', () => {
    const text = '\uFEFF00:00:01,000 --> 00:00:02,000\nLine\n';
    const result = validateSrt(text);

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.cueCount).toBe(1);
    expect(result.ok === true && result.firstCueLabel).toBe('0:01');
  });

  it('accepts the variants real files use: dot fractions, no hours, extra coordinates', () => {
    const variants = [
      '00:01.500 --> 00:02.000\nA\n',
      '00:00:01,000 --> 00:00:02,000 X1:100 X2:200 Y1:300 Y2:400\nA\n',
      '  00:00:01,000 --> 00:00:02,000\nA\n',
    ];

    for (const text of variants) {
      expect(validateSrt(text).ok).toBe(true);
    }
  });

  it('labels cues past an hour with the hours field', () => {
    const result = validateSrt('01:00:05,000 --> 01:00:09,000\nLate\n');

    expect(result.ok === true && result.firstCueLabel).toBe('1:00:05');
    expect(result.ok === true && result.lastCueLabel).toBe('1:00:09');
  });

  it('refuses an empty or whitespace-only file', () => {
    expect(validateSrt('')).toEqual({ ok: false, problem: 'empty', line: null });
    expect(validateSrt('   \n\n  ')).toEqual({ ok: false, problem: 'empty', line: null });
  });

  it('refuses a file that is not text at all', () => {
    expect(validateSrt('\u0000\u0000\u0001\u0002')).toEqual({
      ok: false,
      problem: 'binary',
      line: null,
    });
  });

  it('refuses text that has no cue times', () => {
    expect(validateSrt('Just a note\nwith no timings\n')).toEqual({
      ok: false,
      problem: 'no-cues',
      line: null,
    });
  });

  it('points at the line of a cue time it cannot read', () => {
    const text = ['1', '00:00:01,000 --> ', 'A', '', '2'].join('\n');

    expect(validateSrt(text)).toEqual({ ok: false, problem: 'bad-timing', line: 2 });
  });

  it('refuses a cue that ends before it starts', () => {
    const text = '1\n00:00:09,000 --> 00:00:03,000\nBackwards\n';

    expect(validateSrt(text)).toEqual({ ok: false, problem: 'bad-timing', line: 2 });
  });

  it('refuses a cue with zero length', () => {
    const text = '1\n00:00:03,000 --> 00:00:03,000\nBlink\n';

    expect(validateSrt(text).ok).toBe(false);
  });
});


describe('validateSidecar', () => {
  it('checks the name before the text, so a wrong file is named as such', () => {
    expect(validateSidecar({ name: 'Trip.ass', text: SRT })).toEqual({
      ok: false,
      problem: 'wrong-type',
      line: null,
    });
  });

  it('returns the format and cue facts for a valid file', () => {
    expect(validateSidecar({ name: 'Trip 2026.srt', text: SRT })).toEqual({
      ok: true,
      format: 'srt',
      cueCount: 2,
      firstCueLabel: '0:00',
      lastCueLabel: '0:15',
    });
  });

  it('passes a content problem through with its line number', () => {
    const bad = '00:00:05,000 --> 00:00:01,000\nWrong\n';

    expect(validateSidecar({ name: 'Trip.srt', text: bad })).toEqual({
      ok: false,
      problem: 'bad-timing',
      line: 1,
    });
  });
});

describe('subtitleTargetFor', () => {
  it('gives every video container the codec it actually supports', () => {
    expect(subtitleTargetFor(getPreset('mp4'))?.codec).toBe('mov_text');
    expect(subtitleTargetFor(getPreset('mov'))?.codec).toBe('mov_text');
    expect(subtitleTargetFor(getPreset('mkv'))?.codec).toBe('srt');
    expect(subtitleTargetFor(getPreset('webm'))?.codec).toBe('webvtt');
  });

  it('explains what each container does with the track', () => {
    for (const container of SUBTITLE_CONTAINERS) {
      const preset = PRESETS.find((candidate) => candidate.container === container);
      expect(preset).toBeDefined();
      expect(subtitleTargetFor(preset!)?.note.length).toBeGreaterThan(0);
    }
  });

  it('returns null for audio-only presets', () => {
    for (const preset of PRESETS.filter((candidate) => candidate.kind === 'audio')) {
      expect(subtitleTargetFor(preset)).toBeNull();
    }
  });
});

describe('resolveSubtitleAvailability', () => {
  it('is available when the build lists the codec', () => {
    const availability = resolveSubtitleAvailability(getPreset('mp4'), ['mov_text', 'aac']);

    expect(availability.available).toBe(true);
    expect(availability.reason).toBe('');
    expect(availability.target?.codec).toBe('mov_text');
  });

  it('stays available while the encoder list is unknown', () => {
    expect(resolveSubtitleAvailability(getPreset('webm'), null).available).toBe(true);
  });

  it('is unavailable, with a reason, when the codec is missing from the build', () => {
    const availability = resolveSubtitleAvailability(getPreset('mp4'), ['aac']);

    expect(availability.available).toBe(false);
    expect(availability.reason).toMatch(/mov_text/);
  });

  it('is unavailable for an audio preset and says which format refused', () => {
    const availability = resolveSubtitleAvailability(getPreset('mp3'), ['mov_text']);

    expect(availability.available).toBe(false);
    expect(availability.reason).toContain(getPreset('mp3').label);
    expect(availability.target).toBeNull();
  });
});

describe('subtitleTrackLabel', () => {
  it('names the track, its language, its title, and its codec', () => {
    expect(
      subtitleTrackLabel({
        streamIndex: 1,
        codec: 'subrip',
        language: 'eng',
        title: 'English',
        isDefault: false,
      }),
    ).toBe('Track 2 · eng · English · subrip');
  });

  it('hides the undetermined language and keeps a missing field quiet', () => {
    expect(
      subtitleTrackLabel({
        streamIndex: 0,
        codec: 'ass',
        language: 'und',
        title: null,
        isDefault: true,
      }),
    ).toBe('Track 1 · ass · default');
  });

  it('falls back to the position alone when the container says nothing else', () => {
    expect(
      subtitleTrackLabel({
        streamIndex: 2,
        codec: null,
        language: null,
        title: null,
        isDefault: false,
      }),
    ).toBe('Track 3');
  });
});

describe('subtitleOutputName', () => {
  it('swaps the source extension for the subtitle one', () => {
    expect(subtitleOutputName('Trip 2026.mp4', 'srt')).toBe('Trip 2026.srt');
    expect(subtitleOutputName('Trip 2026.MKV', 'vtt')).toBe('Trip 2026.vtt');
  });

  it('uses the shared sanitiser, so a hostile name stays a name', () => {
    const name = subtitleOutputName('a/b\\c:d.mp4', 'srt');

    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
    expect(name.endsWith('.srt')).toBe(true);
  });
});


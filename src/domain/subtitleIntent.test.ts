import { describe, expect, it } from 'vitest';

import type { Failure } from './errors';
import {
  initialSubtitleState,
  isSubtitleBusy,
  subtitleReducer,
  type SubtitleAction,
  type SubtitleState,
} from './subtitleIntent';
import type { ValidatedSidecar } from './subtitles';

const sidecar: ValidatedSidecar = {
  path: '/cache/job-1/Trip.srt',
  name: 'Trip.srt',
  format: 'srt',
  cueCount: 42,
  firstCueLabel: '0:01',
  lastCueLabel: '24:10',
};

const otherSidecar: ValidatedSidecar = { ...sidecar, path: '/cache/job-2/Other.srt', name: 'Other.srt' };

const failure: Failure = {
  code: 'subtitle-invalid',
  title: 'That subtitle file could not be read',
  message: 'Trip.ass is not a SubRip (.srt) file.',
  recovery: 'Choose an .srt file.',
};

const extractionFailure: Failure = {
  code: 'extraction-failed',
  title: 'No subtitle file was written',
  message: 'FFmpeg stopped before writing the track.',
  recovery: 'Try another track.',
};

/** Applies actions in order, so each test states only what it cares about. */
function run(actions: readonly SubtitleAction[]): SubtitleState {
  return actions.reduce(subtitleReducer, initialSubtitleState);
}

describe('subtitleReducer — sidecar', () => {
  it('starts with nothing chosen and nothing extracted', () => {
    expect(initialSubtitleState).toEqual({
      sidecarStatus: 'absent',
      sidecar: null,
      sidecarFailure: null,
      extractionStatus: 'idle',
      extractionFormat: 'srt',
      extractionOutput: null,
      extractionFailure: null,
    });
  });

  it('marks the picker as open and clears an older refusal', () => {
    const state = run([
      { type: 'sidecar/failed', failure },
      { type: 'sidecar/choosing' },
    ]);

    expect(state.sidecarStatus).toBe('choosing');
    expect(state.sidecarFailure).toBeNull();
  });

  it('stores a validated sidecar only while the picker is open', () => {
    expect(run([{ type: 'sidecar/choosing' }, { type: 'sidecar/ready', sidecar }])).toMatchObject({
      sidecarStatus: 'ready',
      sidecar,
    });

    // A late result from a picker that was already closed is not applied.
    expect(run([{ type: 'sidecar/ready', sidecar }])).toBe(initialSubtitleState);
  });

  it('drops the previous sidecar when the new file is refused', () => {
    const state = run([
      { type: 'sidecar/choosing' },
      { type: 'sidecar/ready', sidecar },
      { type: 'sidecar/choosing' },
      { type: 'sidecar/failed', failure },
    ]);

    expect(state.sidecarStatus).toBe('failed');
    expect(state.sidecar).toBeNull();
    expect(state.sidecarFailure).toBe(failure);
  });

  it('keeps the chosen sidecar when the picker is cancelled', () => {
    const state = run([
      { type: 'sidecar/choosing' },
      { type: 'sidecar/ready', sidecar },
      { type: 'sidecar/choosing' },
      { type: 'sidecar/choosingCancelled' },
    ]);

    expect(state.sidecarStatus).toBe('ready');
    expect(state.sidecar).toBe(sidecar);
  });

  it('returns to absent after a cancel that followed no choice', () => {
    const state = run([{ type: 'sidecar/choosing' }, { type: 'sidecar/choosingCancelled' }]);

    expect(state.sidecarStatus).toBe('absent');
    expect(state.sidecar).toBeNull();
  });

  it('clears the sidecar and its refusal together', () => {
    const state = run([
      { type: 'sidecar/choosing' },
      { type: 'sidecar/ready', sidecar },
      { type: 'sidecar/cleared' },
    ]);

    expect(state.sidecarStatus).toBe('absent');
    expect(state.sidecar).toBeNull();
    expect(state.sidecarFailure).toBeNull();
  });

  it('ignores a clear while the picker is open', () => {
    const state = run([{ type: 'sidecar/choosing' }, { type: 'sidecar/cleared' }]);

    expect(state.sidecarStatus).toBe('choosing');
  });
});


describe('subtitleReducer — extraction', () => {
  const output = { name: 'Trip.srt', path: '/cache/job-1/Trip.srt' };

  it('marks a run as started and then done', () => {
    const state = run([{ type: 'extract/started' }, { type: 'extract/succeeded', output }]);

    expect(state.extractionStatus).toBe('done');
    expect(state.extractionOutput).toEqual(output);
    expect(state.extractionFailure).toBeNull();
  });

  it('records a failure without inventing an output', () => {
    const state = run([
      { type: 'extract/started' },
      { type: 'extract/failed', failure: extractionFailure },
    ]);

    expect(state.extractionStatus).toBe('failed');
    expect(state.extractionOutput).toBeNull();
    expect(state.extractionFailure).toBe(extractionFailure);
  });

  it('ignores results that arrive when no run is in flight', () => {
    expect(run([{ type: 'extract/succeeded', output }]).extractionStatus).toBe('idle');
    expect(run([{ type: 'extract/failed', failure: extractionFailure }]).extractionStatus).toBe(
      'idle',
    );
  });

  it('ignores a second start while one is already running', () => {
    const state = run([{ type: 'extract/started' }, { type: 'extract/started' }]);

    expect(state.extractionStatus).toBe('running');
  });

  it('forgets the old file when the format changes', () => {
    const state = run([
      { type: 'extract/started' },
      { type: 'extract/succeeded', output },
      { type: 'extract/formatSelected', format: 'vtt' },
    ]);

    expect(state.extractionFormat).toBe('vtt');
    expect(state.extractionStatus).toBe('idle');
    expect(state.extractionOutput).toBeNull();
  });

  it('refuses a format change mid-run', () => {
    const state = run([
      { type: 'extract/started' },
      { type: 'extract/formatSelected', format: 'vtt' },
    ]);

    expect(state.extractionFormat).toBe('srt');
    expect(state.extractionStatus).toBe('running');
  });
});

describe('subtitleReducer — the two halves stay independent', () => {
  const output = { name: 'Trip.srt', path: '/cache/job-1/Trip.srt' };

  it('keeps the sidecar through a failed extraction', () => {
    const state = run([
      { type: 'sidecar/choosing' },
      { type: 'sidecar/ready', sidecar },
      { type: 'extract/started' },
      { type: 'extract/failed', failure: extractionFailure },
    ]);

    expect(state.sidecar).toBe(sidecar);
    expect(state.sidecarStatus).toBe('ready');
  });

  it('keeps an extracted file when the sidecar is cleared', () => {
    const state = run([
      { type: 'extract/started' },
      { type: 'extract/succeeded', output },
      { type: 'sidecar/cleared' },
    ]);

    expect(state.extractionOutput).toEqual(output);
    expect(state.extractionStatus).toBe('done');
  });

  it('replaces the sidecar when a second file is chosen', () => {
    const state = run([
      { type: 'sidecar/choosing' },
      { type: 'sidecar/ready', sidecar },
      { type: 'sidecar/choosing' },
      { type: 'sidecar/ready', sidecar: otherSidecar },
    ]);

    expect(state.sidecar).toBe(otherSidecar);
  });
});

describe('isSubtitleBusy', () => {
  it('is busy while the picker is open', () => {
    expect(isSubtitleBusy(run([{ type: 'sidecar/choosing' }]))).toBe(true);
  });

  it('is busy while a track is being extracted', () => {
    expect(isSubtitleBusy(run([{ type: 'extract/started' }]))).toBe(true);
  });

  it('is idle at rest and after a settled failure', () => {
    expect(isSubtitleBusy(initialSubtitleState)).toBe(false);
    expect(isSubtitleBusy(run([{ type: 'sidecar/failed', failure }]))).toBe(false);
    expect(
      isSubtitleBusy(
        run([{ type: 'extract/started' }, { type: 'extract/failed', failure: extractionFailure }]),
      ),
    ).toBe(false);
  });
});

describe('subtitles/reset', () => {
  it('returns the whole panel to its initial state', () => {
    const busy = run([
      { type: 'sidecar/choosing' },
      { type: 'sidecar/ready', sidecar },
      { type: 'extract/started' },
    ]);

    expect(subtitleReducer(busy, { type: 'subtitles/reset' })).toEqual(initialSubtitleState);
  });
});

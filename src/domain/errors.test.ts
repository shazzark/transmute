import { describe, expect, it } from 'vitest';

import {
  describeEngineOutcome,
  describeMissingEncoder,
  describePickFailure,
  describeProbeFailure,
  describeSourceTooSmall,
  describeUnexpectedFailure,
  lastMeaningfulLine,
  type EngineOutcome,
} from './errors';

function outcome(overrides: Partial<EngineOutcome>): EngineOutcome {
  return { success: false, cancelled: false, returnCode: 1, output: '', ...overrides };
}

describe('describeEngineOutcome', () => {
  it('returns null for a successful run', () => {
    expect(describeEngineOutcome(outcome({ success: true, returnCode: 0 }))).toBeNull();
  });

  it('reports a cancel as a terminal state, not an error', () => {
    const failure = describeEngineOutcome(outcome({ cancelled: true, returnCode: 255 }));

    expect(failure?.code).toBe('conversion-cancelled');
    expect(failure?.title).toBe('Cancelled');
    expect(failure?.message).toMatch(/removed/);
  });

  it.each([
    ['No space left on device', 'Not enough space'],
    ['Permission denied', 'Could not read the file'],
    ['Invalid data found when processing input', 'Unsupported file'],
    ['Unknown encoder: libx264', 'Encoder unavailable'],
  ])('maps engine output %j to %j', (output, title) => {
    const failure = describeEngineOutcome(outcome({ output }));

    expect(failure?.title).toBe(title);
    expect(failure?.recovery).toBeTruthy();
  });

  it('maps the engine log from a real unreadable file to Unsupported file', () => {
    // Captured 2026-10-29: `ffmpeg -i notes.txt` on FFmpeg 8.0 prints these
    // lines, and the last one is what the Details expander shows.
    const output = [
      '[in#0 @ 0x000001ee69663e80] Error opening input: Invalid data found when processing input',
      'Error opening input file /data/user/0/dev.transmute/cache/notes.txt.',
      'Error opening input files: Invalid data found when processing input',
    ].join('\n');

    const failure = describeEngineOutcome(outcome({ returnCode: 1, output }));

    expect(failure?.code).toBe('unsupported-source');
    expect(failure?.title).toBe('Unsupported file');
    expect(failure?.recovery).toContain('Choose a different file');
    expect(failure?.detail).toBe(
      'Exit code 1: Error opening input files: Invalid data found when processing input',
    );
  });

  it('keeps the exit code for an unmapped failure and never says just "Error"', () => {
    const failure = describeEngineOutcome(
      outcome({ returnCode: 42, output: 'frame=  120 fps=0.0\nsomething odd happened\n' }),
    );

    expect(failure?.code).toBe('engine-failed');
    expect(failure?.title).toBe('Conversion failed');
    expect(failure?.message).toContain('42');
    expect(failure?.detail).toBe('Exit code 42: something odd happened');
    expect(failure?.title).not.toBe('Error');
  });

  it('still has a detail line when the engine printed nothing', () => {
    const failure = describeEngineOutcome(outcome({ returnCode: 3, output: '' }));

    expect(failure?.detail).toBe('Exit code 3');
  });
});

describe('lastMeaningfulLine', () => {
  it('skips blank trailing lines and trims', () => {
    expect(lastMeaningfulLine('first\n  second  \n\n')).toBe('second');
  });

  it('returns an empty string for empty output', () => {
    expect(lastMeaningfulLine('')).toBe('');
    expect(lastMeaningfulLine('\n \n')).toBe('');
  });
});

describe('other failures', () => {
  it('describes a failed probe with a next step', () => {
    const failure = describeProbeFailure(outcome({ output: 'Invalid data found' }));

    expect(failure.code).toBe('unsupported-source');
    expect(failure.recovery.length).toBeGreaterThan(0);
  });

  it('turns an exception into a row failure with a next step', () => {
    const failure = describeUnexpectedFailure(new Error('bridge exploded'));

    expect(failure.code).toBe('engine-failed');
    expect(failure.title.length).toBeGreaterThan(0);
    expect(failure.recovery.length).toBeGreaterThan(0);
    expect(failure.detail).toBe('bridge exploded');
  });

  it('does not invent a detail for a throw with no message', () => {
    // A round-tripped object or a bare `throw` has nothing worth showing; the
    // failure still has to be reported, so only the detail is dropped.
    expect(describeUnexpectedFailure({}).detail).toBeUndefined();
    expect(describeUnexpectedFailure(new Error('')).detail).toBeUndefined();
    expect(describeUnexpectedFailure('nope').detail).toBeUndefined();
  });

  it('names the encoders the build was missing', () => {
    const failure = describeMissingEncoder(['h264_mediacodec', 'libopenh264']);

    expect(failure.code).toBe('no-encoder');
    expect(failure.detail).toContain('h264_mediacodec');
  });

  it('reports a small source with its dimensions', () => {
    const failure = describeSourceTooSmall(160, 120);

    expect(failure.code).toBe('source-too-small');
    expect(failure.message).toContain('160×120');
    expect(failure.message).toContain('176×144');
  });

  it('carries the provider error text into the details only', () => {
    const failure = describePickFailure(new Error('provider revoked the grant'));

    expect(failure.code).toBe('pick-failed');
    expect(failure.detail).toBe('provider revoked the grant');
    expect(failure.message).not.toContain('revoked');
  });

  it('works when the picker throws a string', () => {
    expect(describePickFailure('boom').detail).toBeUndefined();
  });
});

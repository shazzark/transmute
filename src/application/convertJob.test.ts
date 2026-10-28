import { describe, expect, it } from 'vitest';

import { canConvert, initialJobState, isBusy, jobReducer, type JobState } from './convertJob';
import type { SourceFile } from './convertJob';
import type { MediaSummary } from '../domain/probe';

const source: SourceFile = {
  path: '/data/user/0/dev.transmute/cache/picked.mp4',
  name: 'Trip 2026.mp4',
  sizeBytes: 1024,
  mimeType: 'video/mp4',
};

const summary: MediaSummary = {
  durationMs: 30_000,
  durationLabel: '0:30',
  container: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  width: 1080,
  height: 1920,
  hasVideo: true,
  hasAudio: true,
};

function probed(): JobState {
  return jobReducer(jobReducer(initialJobState, { type: 'pick/started', source }), {
    type: 'probe/succeeded',
    summary,
    encoderName: 'h264_mediacodec',
  });
}

function converting(): JobState {
  return jobReducer(probed(), { type: 'convert/started' });
}

const failure = {
  code: 'engine-failed' as const,
  title: 'Conversion failed',
  message: 'The engine stopped with exit code 1.',
  recovery: 'Try a different file.',
};

describe('jobReducer — pick and probe', () => {
  it('starts in the idle state the empty screen renders', () => {
    expect(initialJobState.status).toBe('idle');
    expect(initialJobState.source).toBeNull();
    expect(initialJobState.progress).toBe(0);
    expect(canConvert(initialJobState)).toBe(false);
  });

  it('treats a cancelled picker as "no file", not as a failure', () => {
    const state = jobReducer(initialJobState, { type: 'pick/cancelled' });

    expect(state.status).toBe('idle');
    expect(state.failure).toBeNull();
  });

  it('shows a picked file while probing', () => {
    const state = jobReducer(initialJobState, { type: 'pick/started', source });

    expect(state.status).toBe('probing');
    expect(state.source).toBe(source);
    expect(isBusy(state.status)).toBe(true);
  });

  it('moves to ready with the summary after probing', () => {
    const state = probed();

    expect(state.status).toBe('ready');
    expect(state.summary).toEqual(summary);
    expect(state.encoderName).toBe('h264_mediacodec');
    expect(state.indeterminate).toBe(false);
    expect(canConvert(state)).toBe(true);
  });

  it('marks progress indeterminate when the duration is unknown', () => {
    const state = jobReducer(jobReducer(initialJobState, { type: 'pick/started', source }), {
      type: 'probe/succeeded',
      summary: { ...summary, durationMs: null, durationLabel: null },
      encoderName: 'libopenh264',
    });

    expect(state.indeterminate).toBe(true);
  });

  it('fails with the probe failure', () => {
    const state = jobReducer(jobReducer(initialJobState, { type: 'pick/started', source }), {
      type: 'probe/failed',
      failure,
    });

    expect(state.status).toBe('failed');
    expect(state.failure).toBe(failure);
    expect(canConvert(state)).toBe(false);
  });

  it('ignores a preset change while the engine is working', () => {
    const state = jobReducer(converting(), { type: 'preset/selected', presetId: 'mp3' });

    expect(state.presetId).toBe('mp4');
  });

  it('drops the encoder resolved for the previous format on a preset change', () => {
    const state = jobReducer(probed(), { type: 'preset/selected', presetId: 'webm' });

    expect(state.presetId).toBe('webm');
    expect(state.encoderName).toBeNull();
    // The preview stays, and Convert stays available: the job re-resolves.
    expect(state.summary).toEqual(summary);
    expect(canConvert(state)).toBe(true);
  });
});

describe('jobReducer — conversion', () => {
  it('keeps progress monotonic and ignores ticks outside a running job', () => {
    let state = converting();
    state = jobReducer(state, { type: 'convert/progress', percent: 40, elapsedMs: 4000 });
    state = jobReducer(state, { type: 'convert/progress', percent: 10, elapsedMs: 5000 });
    const idleTick = jobReducer(initialJobState, {
      type: 'convert/progress',
      percent: 90,
      elapsedMs: 100,
    });

    expect(state.progress).toBe(40);
    expect(state.elapsedMs).toBe(5000);
    expect(idleTick.progress).toBe(0);
  });

  it('reaches 100% on success even if the last tick was lower', () => {
    let state = jobReducer(converting(), { type: 'convert/progress', percent: 97, elapsedMs: 9000 });
    state = jobReducer(state, {
      type: 'convert/succeeded',
      output: { name: 'Trip 2026.mp4', path: '/cache/job-1/Trip 2026.mp4' },
    });

    expect(state.status).toBe('done');
    expect(state.progress).toBe(100);
    expect(state.indeterminate).toBe(false);
    expect(state.output?.name).toBe('Trip 2026.mp4');
  });

  it('moves to cancelling, then to cancelled, and stays there', () => {
    const cancelling = jobReducer(converting(), { type: 'convert/cancelRequested' });
    const cancelled = jobReducer(cancelling, { type: 'convert/cancelled' });
    const twice = jobReducer(cancelled, { type: 'convert/cancelled' });

    expect(cancelling.status).toBe('cancelling');
    expect(cancelled.status).toBe('cancelled');
    expect(twice.status).toBe('cancelled');
    expect(cancelled.failure).toBeNull();
  });

  it('ignores a cancel request from a non-running state', () => {
    expect(jobReducer(initialJobState, { type: 'convert/cancelRequested' }).status).toBe('idle');
    expect(jobReducer(probed(), { type: 'convert/cancelRequested' }).status).toBe('ready');
  });

  it('shows the failure and drops any stale output', () => {
    const done = jobReducer(converting(), {
      type: 'convert/succeeded',
      output: { name: 'a.mp4', path: '/cache/a.mp4' },
    });
    const failed = jobReducer(jobReducer(done, { type: 'convert/started' }), {
      type: 'convert/failed',
      failure,
    });

    expect(failed.status).toBe('failed');
    expect(failed.failure).toBe(failure);
    expect(failed.output).toBeNull();
    expect(canConvert(failed)).toBe(true);
  });

  it('refuses to start or finish without a running job', () => {
    expect(jobReducer(initialJobState, { type: 'convert/started' }).status).toBe('idle');

    const straySuccess = jobReducer(initialJobState, {
      type: 'convert/succeeded',
      output: { name: 'a.mp4', path: '/cache/a.mp4' },
    });

    expect(straySuccess.status).toBe('idle');
    expect(straySuccess.output).toBeNull();
  });

  it('resets back to idle but remembers the chosen preset', () => {
    const withPreset = jobReducer(
      jobReducer(probed(), { type: 'preset/selected', presetId: 'mp3' }),
      { type: 'reset' },
    );

    expect(withPreset.status).toBe('idle');
    expect(withPreset.source).toBeNull();
    expect(withPreset.presetId).toBe('mp3');
  });
});


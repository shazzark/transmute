import { describe, expect, it, vi } from 'vitest';

import { getPreset } from '../domain/presets';
import { summariseProbe } from '../domain/probe';
import { initialJobState, jobReducer, type JobAction, type JobState } from './convertJob';
import { prepareSource, runConversion, type ConversionPorts, type ProbeOutcome } from './runConversion';

const source = {
  path: '/data/user/0/dev.transmute/cache/picked.mp4',
  name: 'Trip 2026.mp4',
  sizeBytes: 4_000_000,
  mimeType: 'video/mp4',
};

const report = {
  format: { duration: '10.0', format_name: 'mp4' },
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920 },
    { codec_type: 'audio', codec_name: 'aac' },
  ],
};

const probeOk: ProbeOutcome = {
  ok: true,
  information: report,
  outcome: { success: true, cancelled: false, returnCode: 0, output: '' },
};

interface Fakes {
  readonly ports: ConversionPorts;
  readonly removeDirectory: ReturnType<typeof vi.fn>;
  readonly convert: ReturnType<typeof vi.fn>;
}

function makePorts(overrides: Partial<ConversionPorts> = {}): Fakes {
  const removeDirectory = vi.fn(async () => undefined);
  const convert = vi.fn(async () => ({
    success: true,
    cancelled: false,
    returnCode: 0,
    output: '',
  }));

  const ports: ConversionPorts = {
    probe: async () => probeOk,
    listEncoders: async () => ['h264_mediacodec', 'libopenh264', 'aac'],
    convert,
    createJobDirectory: async () => '/cache/jobs/job-1',
    removeDirectory,
    fileExists: async () => true,
    listDirectory: async () => [],
    joinPath: (directory, name) => `${directory}/${name}`,
    ...overrides,
  };

  return { ports, removeDirectory, convert };
}

/** Replays the dispatched actions through the real reducer. */
function trackState() {
  let state: JobState = initialJobState;
  const actions: JobAction[] = [];
  return {
    dispatch: (action: JobAction) => {
      actions.push(action);
      state = jobReducer(state, action);
    },
    get state() {
      return state;
    },
    actions,
  };
}

describe('runConversion — success', () => {
  it('probes, converts with the resolved encoder, and keeps the output directory', async () => {
    const { ports, removeDirectory, convert } = makePorts();
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
      now: () => 1000,
    });

    expect(result.status).toBe('done');
    expect(result.outputPath).toBe('/cache/jobs/job-1/Trip 2026.mp4');
    expect(tracker.state.status).toBe('done');
    expect(tracker.state.encoderName).toBe('h264_mediacodec');
    // Phase 1 keeps the file: it is the only copy of the result.
    expect(removeDirectory).not.toHaveBeenCalled();

    const argv = convert.mock.calls[0]?.[0].argv as string[];
    expect(argv[argv.indexOf('-c:v') + 1]).toBe('h264_mediacodec');
    expect(argv[argv.indexOf('-pix_fmt') + 1]).toBe('nv12');
  });

  it('maps statistics to monotonic progress that ends at 100', async () => {
    const convert = vi.fn(async (request: { onProgress: (ms: number) => void }) => {
      request.onProgress(2500);
      request.onProgress(9000);
      request.onProgress(1000);
      request.onProgress(10_000);
      return { success: true, cancelled: false, returnCode: 0, output: '' };
    });
    const { ports } = makePorts({ convert });
    const tracker = trackState();

    await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    const percents = tracker.actions
      .filter((action): action is Extract<JobAction, { type: 'convert/progress' }> =>
        action.type === 'convert/progress',
      )
      .map((action) => action.percent);

    expect(percents).toEqual([25, 90, 90, 100]);
    expect(tracker.state.progress).toBe(100);
  });

  it('resolves a name collision before handing the path to FFmpeg', async () => {
    const { ports, convert } = makePorts({ listDirectory: async () => ['Trip 2026.mp4'] });

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: trackState().dispatch,
    });

    expect(result.outputPath).toBe('/cache/jobs/job-1/Trip 2026 (2).mp4');
    expect((convert.mock.calls[0]?.[0].argv as string[]).at(-1)).toBe(
      '/cache/jobs/job-1/Trip 2026 (2).mp4',
    );
  });

  it('falls back to the software encoder and reports it', async () => {
    const { ports, convert } = makePorts({ listEncoders: async () => ['libopenh264', 'aac'] });
    const tracker = trackState();

    await runConversion({ source, preset: getPreset('mp4'), ports, dispatch: tracker.dispatch });

    const argv = convert.mock.calls[0]?.[0].argv as string[];
    expect(argv[argv.indexOf('-c:v') + 1]).toBe('libopenh264');
    expect(argv[argv.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
    expect(tracker.state.encoderName).toBe('libopenh264');
  });
});

describe('prepareSource', () => {
  it('reaches ready and names the resolved encoder without writing anything', async () => {
    const { ports, removeDirectory, convert } = makePorts();
    const tracker = trackState();

    const result = await prepareSource({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.status).toBe('ready');
    expect(tracker.state.status).toBe('ready');
    expect(tracker.state.encoderName).toBe('h264_mediacodec');
    expect(tracker.state.summary?.durationLabel).toBe('0:10');
    expect(convert).not.toHaveBeenCalled();
    expect(removeDirectory).not.toHaveBeenCalled();
  });

  it('stops at the probe failure with a readable message', async () => {
    const { ports } = makePorts({
      probe: async () => ({
        ok: false,
        outcome: { success: false, cancelled: false, returnCode: 1, output: 'moov atom not found' },
      }),
    });
    const tracker = trackState();

    const result = await prepareSource({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.title).toBe('Unsupported file');
    expect(tracker.state.status).toBe('failed');
  });

  it('returns to the empty state when prepared work is cancelled', async () => {
    const { ports } = makePorts();
    const tracker = trackState();

    const result = await prepareSource({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
      cancelSignal: { cancelled: true },
    });

    expect(result.status).toBe('cancelled');
    expect(tracker.state.status).toBe('idle');
    expect(tracker.state.failure).toBeNull();
  });
});

describe('runConversion — failures', () => {
  it('stops before writing when the probe fails', async () => {
    const { ports, removeDirectory, convert } = makePorts({
      probe: async () => ({
        ok: false,
        outcome: { success: false, cancelled: false, returnCode: 1, output: 'Invalid data found' },
      }),
    });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.title).toBe('Unsupported file');
    expect(tracker.state.status).toBe('failed');
    expect(convert).not.toHaveBeenCalled();
    expect(removeDirectory).not.toHaveBeenCalled();
  });

  it('fails with a named encoder error when the build has none', async () => {
    const { ports, convert } = makePorts({ listEncoders: async () => ['aac'] });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.failure?.code).toBe('no-encoder');
    expect(result.failure?.detail).toContain('h264_mediacodec');
    expect(convert).not.toHaveBeenCalled();
  });

  it('refuses a source below the hardware encoder minimum', async () => {
    const { ports } = makePorts({
      probe: async () => ({
        ...probeOk,
        information: {
          streams: [{ codec_type: 'video', codec_name: 'h264', width: 160, height: 120 }],
          format: { duration: '3.0' },
        },
      }),
    });

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: trackState().dispatch,
    });

    expect(result.failure?.code).toBe('source-too-small');
  });

  it('cleans the job directory exactly once when the engine fails', async () => {
    const { ports, removeDirectory } = makePorts({
      convert: async () => ({
        success: false,
        cancelled: false,
        returnCode: 1,
        output: 'Unknown encoder: h264_mediacodec',
      }),
    });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.title).toBe('Encoder unavailable');
    expect(removeDirectory).toHaveBeenCalledTimes(1);
    expect(removeDirectory).toHaveBeenCalledWith('/cache/jobs/job-1');
    expect(tracker.state.status).toBe('failed');
  });

  it('cleans up and reports cancelled for a cancelled engine session', async () => {
    const { ports, removeDirectory } = makePorts({
      convert: async () => ({ success: false, cancelled: true, returnCode: 255, output: '' }),
    });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.status).toBe('cancelled');
    expect(removeDirectory).toHaveBeenCalledTimes(1);
    expect(tracker.state.status).toBe('cancelled');
    expect(tracker.state.failure).toBeNull();
  });

  it('cancels mid-conversion without claiming an output or leaving the job directory', async () => {
    const convert = vi.fn(async (request: { onProgress: (ms: number) => void }) => {
      // Two statistics land before the engine acknowledges the cancel, which is
      // the state a user actually sees when they press Cancel during a job.
      request.onProgress(2000);
      request.onProgress(6000);
      return {
        success: false,
        cancelled: true,
        returnCode: 255,
        output: 'Exiting normally, received signal 2.',
      };
    });
    const { ports, removeDirectory } = makePorts({ convert });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(convert).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('cancelled');
    expect(result.outputPath).toBeNull();
    expect(result.failure).toBeNull();
    // The partial output is gone: exactly one removal, of the whole job directory.
    expect(removeDirectory).toHaveBeenCalledTimes(1);
    expect(removeDirectory).toHaveBeenCalledWith('/cache/jobs/job-1');
    expect(tracker.state.status).toBe('cancelled');
    // Progress up to the cancel is kept as evidence; no output is claimed.
    expect(tracker.state.progress).toBe(60);
    expect(tracker.state.output).toBeNull();
    expect(tracker.state.failure).toBeNull();
  });

  it('refuses an unreadable file before it creates a job directory', async () => {
    // Captured 2026-10-29 from FFmpeg 8.0 given a plain-text file: the mapping
    // is checked against the engine's own wording, not an invented string.
    const engineLog = [
      '[in#0 @ 0x000001ee69663e80] Error opening input: Invalid data found when processing input',
      'Error opening input file /data/user/0/dev.transmute/cache/notes.txt.',
      'Error opening input files: Invalid data found when processing input',
    ].join('\n');

    const createJobDirectory = vi.fn(async () => '/cache/jobs/job-1');
    const { ports, convert } = makePorts({
      createJobDirectory,
      probe: async () => ({
        ok: false,
        outcome: { success: false, cancelled: false, returnCode: 1, output: engineLog },
      }),
    });
    const tracker = trackState();

    const result = await runConversion({
      source: { ...source, name: 'notes.txt', mimeType: 'text/plain' },
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('unsupported-source');
    expect(result.failure?.title).toBe('Unsupported file');
    expect(result.failure?.detail).toContain('Invalid data found');
    expect(convert).not.toHaveBeenCalled();
    // Nothing was written, so nothing needs cleaning up either.
    expect(createJobDirectory).not.toHaveBeenCalled();
    expect(tracker.state.status).toBe('failed');
  });

  it('treats success without an output file as a failure and cleans up', async () => {
    const { ports, removeDirectory } = makePorts({ fileExists: async () => false });

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: trackState().dispatch,
    });

    expect(result.failure?.code).toBe('output-missing');
    expect(removeDirectory).toHaveBeenCalledTimes(1);
  });

  it('turns a bad path into a specific failure and cleans up', async () => {
    const { ports, removeDirectory, convert } = makePorts({
      joinPath: () => source.path,
    });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.title).toBe('Could not build the command');
    expect(convert).not.toHaveBeenCalled();
    expect(removeDirectory).toHaveBeenCalledTimes(1);
    expect(tracker.state.failure?.title).toBe('Could not build the command');
  });

  it('reports a thrown adapter error instead of leaking the exception', async () => {
    const { ports, removeDirectory } = makePorts({
      convert: async () => {
        throw new Error('native module not linked');
      },
    });

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: trackState().dispatch,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.detail).toBe('native module not linked');
    expect(removeDirectory).toHaveBeenCalledTimes(1);
  });
});

describe('runConversion — audio presets', () => {
  /** A source with a picture but no sound, which no audio preset can use. */
  const silentProbe: ProbeOutcome = {
    ok: true,
    information: {
      format: { duration: '3.0', format_name: 'mp4' },
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920 }],
    },
    outcome: { success: true, cancelled: false, returnCode: 0, output: '' },
  };

  it('extracts audio and reports the audio encoder, not a video one', async () => {
    const { ports, convert } = makePorts({ listEncoders: async () => ['libmp3lame'] });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp3'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.status).toBe('done');
    expect(result.outputPath).toBe('/cache/jobs/job-1/Trip 2026.mp3');
    expect(tracker.state.encoderName).toBe('libmp3lame');

    const argv = convert.mock.calls[0]?.[0].argv as string[];
    expect(argv).toContain('-vn');
    expect(argv).not.toContain('-c:v');
    expect(argv[argv.indexOf('-c:a') + 1]).toBe('libmp3lame');
  });

  it('keeps the audio encoder out of the video slot on the prepared path', async () => {
    const { ports, convert } = makePorts({ listEncoders: async () => ['libmp3lame'] });
    const tracker = trackState();
    const preset = getPreset('mp3');

    const prepared = await prepareSource({
      source,
      preset,
      ports,
      dispatch: tracker.dispatch,
    });
    const summary = prepared.summary;
    const encoderName = tracker.state.encoderName;

    expect(prepared.status).toBe('ready');
    expect(encoderName).toBe('libmp3lame');
    if (summary === null || encoderName === null) {
      throw new Error('prepareSource did not hand back a probed summary');
    }

    const result = await runConversion({
      source,
      preset,
      ports,
      dispatch: tracker.dispatch,
      prepared: { summary, encoderName, presetId: 'mp3' },
    });

    expect(result.status).toBe('done');
    const argv = convert.mock.calls[0]?.[0].argv as string[];
    expect(argv).not.toContain('-c:v');
    expect(argv).not.toContain('-pix_fmt');
    expect(argv.at(-1)).toBe('/cache/jobs/job-1/Trip 2026.mp3');
  });

  it('re-resolves when the prepared encoder belongs to another preset', async () => {
    const probe = vi.fn(async () => probeOk);
    const { ports, convert } = makePorts({
      probe,
      listEncoders: async () => ['h264_mediacodec', 'libvpx-vp9', 'aac', 'libopus'],
    });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('webm'),
      ports,
      dispatch: tracker.dispatch,
      // Resolved for MP4 a moment ago; WebM needs VP9, so it must be re-resolved
      // instead of handing H.264 to a WebM job.
      prepared: {
        summary: summariseProbe(report),
        encoderName: 'h264_mediacodec',
        presetId: 'mp4',
      },
    });

    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('done');
    expect(tracker.state.encoderName).toBe('libvpx-vp9');

    const argv = convert.mock.calls[0]?.[0].argv as string[];
    expect(argv[argv.indexOf('-c:v') + 1]).toBe('libvpx-vp9');
    expect(argv.at(-1)).toBe('/cache/jobs/job-1/Trip 2026.webm');
  });

  it('refuses to extract audio from a file that has none', async () => {
    const { ports, convert } = makePorts({ probe: async () => silentProbe });
    const tracker = trackState();

    const result = await runConversion({
      source,
      preset: getPreset('mp3'),
      ports,
      dispatch: tracker.dispatch,
    });

    expect(result.failure?.code).toBe('unsupported-source');
    expect(result.failure?.title).toBe('No audio found');
    expect(convert).not.toHaveBeenCalled();
    expect(tracker.state.status).toBe('failed');
  });

  it('names the missing audio encoder instead of writing a file', async () => {
    const { ports, convert } = makePorts({
      listEncoders: async () => ['h264_mediacodec', 'aac'],
    });

    const result = await runConversion({
      source,
      preset: getPreset('wav'),
      ports,
      dispatch: trackState().dispatch,
    });

    expect(result.failure?.code).toBe('no-encoder');
    expect(result.failure?.detail).toContain('pcm_s16le');
    expect(convert).not.toHaveBeenCalled();
  });

  it('refuses a video preset when the build cannot encode the source audio', async () => {
    const { ports, convert } = makePorts({ listEncoders: async () => ['h264_mediacodec'] });

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: trackState().dispatch,
    });

    expect(result.failure?.code).toBe('no-encoder');
    expect(result.failure?.detail).toContain('aac');
    expect(convert).not.toHaveBeenCalled();
  });

  it('does not ask for an audio encoder when the source is silent', async () => {
    const { ports } = makePorts({
      listEncoders: async () => ['h264_mediacodec'],
      probe: async () => silentProbe,
    });

    const result = await runConversion({
      source,
      preset: getPreset('mp4'),
      ports,
      dispatch: trackState().dispatch,
    });

    expect(result.status).toBe('done');
  });
});


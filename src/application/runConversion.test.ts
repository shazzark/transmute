import { describe, expect, it, vi } from 'vitest';

import { getPreset } from '../domain/presets';
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
    const { ports, convert } = makePorts({ listEncoders: async () => ['libopenh264'] });
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

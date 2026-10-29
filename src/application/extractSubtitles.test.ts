import { describe, expect, it, vi } from 'vitest';

import type { SubtitleAction } from '../domain/subtitleIntent';
import { extractSubtitles, type ExtractionPorts } from './extractSubtitles';

interface Fakes {
  readonly ports: ExtractionPorts;
  readonly convert: ReturnType<typeof vi.fn>;
  readonly removeDirectory: ReturnType<typeof vi.fn>;
  readonly createJobDirectory: ReturnType<typeof vi.fn>;
}

function makePorts(overrides: Partial<ExtractionPorts> = {}): Fakes {
  const convert = vi.fn(async () => ({
    success: true,
    cancelled: false,
    returnCode: 0,
    output: '',
  }));
  const removeDirectory = vi.fn(async () => undefined);
  const createJobDirectory = vi.fn(async () => '/cache/jobs/job-1');

  const ports: ExtractionPorts = {
    convert,
    createJobDirectory,
    removeDirectory,
    fileExists: async () => true,
    listDirectory: async () => [],
    joinPath: (directory, name) => `${directory}/${name}`,
    ...overrides,
  };

  return { ports, convert, removeDirectory, createJobDirectory };
}

function trackDispatch() {
  const actions: SubtitleAction[] = [];
  return { actions, dispatch: (action: SubtitleAction) => actions.push(action) };
}

const base = {
  sourcePath: '/cache/in.mkv',
  sourceName: 'Trip 2026.mkv',
  streamIndex: 1,
  format: 'srt' as const,
};

describe('extractSubtitles — success', () => {
  it('writes one mapped track and keeps the directory', async () => {
    const { ports, convert, removeDirectory } = makePorts();
    const tracker = trackDispatch();

    const outcome = await extractSubtitles({ ...base, ports, dispatch: tracker.dispatch });

    expect(outcome).toEqual({
      status: 'done',
      output: { name: 'Trip 2026.srt', path: '/cache/jobs/job-1/Trip 2026.srt' },
    });
    expect(removeDirectory).not.toHaveBeenCalled();
    expect(tracker.actions.map((action) => action.type)).toEqual([
      'extract/started',
      'extract/succeeded',
    ]);

    const request = convert.mock.calls[0]?.[0] as { argv: string[]; durationMs: unknown };
    expect(request.argv).toContain('0:s:1');
    expect(request.argv.at(-1)).toBe('/cache/jobs/job-1/Trip 2026.srt');
    // A text copy has no useful percentage, so no duration is handed over.
    expect(request.durationMs).toBeUndefined();
  });

  it('asks for WebVTT when that format is chosen', async () => {
    const { ports, convert } = makePorts();

    const outcome = await extractSubtitles({
      ...base,
      format: 'vtt',
      ports,
      dispatch: trackDispatch().dispatch,
    });

    const argv = (convert.mock.calls[0]?.[0] as { argv: string[] }).argv;
    expect(argv[argv.indexOf('-c:s') + 1]).toBe('webvtt');
    expect(outcome.status === 'done' && outcome.output.name).toBe('Trip 2026.vtt');
  });

  it('does not overwrite a name already in the job directory', async () => {
    const { ports, convert } = makePorts({
      listDirectory: async () => ['Trip 2026.srt'],
    });

    const outcome = await extractSubtitles({ ...base, ports, dispatch: trackDispatch().dispatch });

    expect(outcome.status === 'done' && outcome.output.name).toBe('Trip 2026 (2).srt');
    const argv = (convert.mock.calls[0]?.[0] as { argv: string[] }).argv;
    expect(argv.at(-1)).toBe('/cache/jobs/job-1/Trip 2026 (2).srt');
  });
});

describe('extractSubtitles — the engine refuses', () => {
  it('removes the directory and reports the track as missing', async () => {
    const { ports, removeDirectory } = makePorts({
      convert: vi.fn(async () => ({
        success: false,
        cancelled: false,
        returnCode: 1,
        output: 'Stream map \'0:s:5\' matches no streams.\n',
      })),
    });
    const tracker = trackDispatch();

    const outcome = await extractSubtitles({ ...base, ports, dispatch: tracker.dispatch });

    expect(outcome.status === 'failed' && outcome.failure.code).toBe('no-subtitle-track');
    expect(removeDirectory).toHaveBeenCalledWith('/cache/jobs/job-1');
    expect(tracker.actions.at(-1)?.type).toBe('extract/failed');
  });

  it('reports a cancellation as cancelled, with nothing left behind', async () => {
    const { ports, removeDirectory } = makePorts({
      convert: vi.fn(async () => ({
        success: false,
        cancelled: true,
        returnCode: 255,
        output: '',
      })),
    });

    const outcome = await extractSubtitles({ ...base, ports, dispatch: trackDispatch().dispatch });

    expect(outcome.status === 'failed' && outcome.failure.title).toBe('Extraction cancelled');
    expect(removeDirectory).toHaveBeenCalledTimes(1);
  });

  it('keeps the exit code in Details instead of swallowing it', async () => {
    const { ports } = makePorts({
      convert: vi.fn(async () => ({
        success: false,
        cancelled: false,
        returnCode: 1,
        output: 'Error opening output file\nInvalid argument\n',
      })),
    });

    const outcome = await extractSubtitles({ ...base, ports, dispatch: trackDispatch().dispatch });

    expect(outcome.status === 'failed' && outcome.failure.detail).toContain('Exit code 1');
    expect(outcome.status === 'failed' && outcome.failure.detail).toContain('Invalid argument');
  });

  it('refuses to report success when no file was written', async () => {
    const { ports, removeDirectory } = makePorts({ fileExists: async () => false });

    const outcome = await extractSubtitles({ ...base, ports, dispatch: trackDispatch().dispatch });

    expect(outcome.status === 'failed' && outcome.failure.code).toBe('output-missing');
    expect(outcome.status === 'failed' && outcome.failure.detail).toContain('Trip 2026.srt');
    expect(removeDirectory).toHaveBeenCalledWith('/cache/jobs/job-1');
  });
});

describe('extractSubtitles — before the engine starts', () => {
  it('honours a cancel signal without starting a job', async () => {
    const { ports, convert, removeDirectory } = makePorts();

    const outcome = await extractSubtitles({
      ...base,
      ports,
      dispatch: trackDispatch().dispatch,
      cancelSignal: { cancelled: true },
    });

    expect(outcome.status === 'failed' && outcome.failure.title).toBe('Extraction cancelled');
    expect(convert).not.toHaveBeenCalled();
    expect(removeDirectory).toHaveBeenCalledWith('/cache/jobs/job-1');
  });

  it('reports an unusable source path and cleans up the empty directory', async () => {
    const { ports, convert, removeDirectory } = makePorts();

    const outcome = await extractSubtitles({
      ...base,
      sourcePath: '-in.mkv',
      ports,
      dispatch: trackDispatch().dispatch,
    });

    expect(outcome.status === 'failed' && outcome.failure.title).toBe('Could not build the command');
    expect(convert).not.toHaveBeenCalled();
    expect(removeDirectory).toHaveBeenCalledWith('/cache/jobs/job-1');
  });

  it('reports a failure from the filesystem without a directory to clean', async () => {
    const removeDirectory = vi.fn(async () => undefined);
    const { ports } = makePorts({
      createJobDirectory: vi.fn(async () => {
        throw new Error('No space left on device');
      }),
      removeDirectory,
    });

    const outcome = await extractSubtitles({ ...base, ports, dispatch: trackDispatch().dispatch });

    expect(outcome.status === 'failed' && outcome.failure.code).toBe('extraction-failed');
    expect(outcome.status === 'failed' && outcome.failure.detail).toBe('No space left on device');
    expect(removeDirectory).not.toHaveBeenCalled();
  });
});


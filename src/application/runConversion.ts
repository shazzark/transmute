/**
 * Source preparation and one conversion, start to finish.
 *
 * `prepareSource` probes a picked file and resolves the encoder, which is what
 * the screen needs before offering Convert. `runConversion` then runs the job.
 *
 * The orchestrator owns the cleanup rule: a job directory is removed exactly
 * once on cancel or failure, and kept on success because in Phase 1 it holds the
 * only copy of the result (D1, TR-08). Every dependency is a port, so the whole
 * pipeline is tested with fakes and no native module (TR-21).
 */

import {
  chooseVideoEncoder,
  isHardwareEncoder,
  meetsHardwareMinimum,
  pixelFormatFor,
  type EncoderChoice,
} from '../domain/encoders';
import {
  describeEngineOutcome,
  describeMissingEncoder,
  describeProbeFailure,
  describeSourceTooSmall,
  type EngineOutcome,
  type Failure,
} from '../domain/errors';
import { buildConversionArgv, InvalidCommandError } from '../domain/ffmpegCommand';
import { buildOutputName, resolveCollision, sanitizeBaseName } from '../domain/naming';
import type { Preset } from '../domain/presets';
import { progressFromStatistics } from '../domain/progress';
import { summariseProbe, type MediaSummary, type RawProbeInformation } from '../domain/probe';
import type { JobAction, SourceFile } from './convertJob';

export interface ProbeOutcome {
  readonly ok: boolean;
  readonly information?: RawProbeInformation;
  readonly outcome: EngineOutcome;
}

export interface ConvertRequest {
  readonly argv: readonly string[];
  readonly durationMs: number | undefined;
  /** Called with the engine's `timeMs` for every statistics tick. */
  readonly onProgress: (processedMs: number) => void;
  /** Called with the native session id so Cancel can target this job. */
  readonly onSession: (sessionId: number) => void;
}

export interface ConversionPorts {
  /** FFprobe through the engine, returning the parsed report. */
  probe(path: string): Promise<ProbeOutcome>;
  /** Encoders the bundled build can write. */
  listEncoders(): Promise<readonly string[]>;
  /** Runs FFmpeg and resolves when the native session settles. */
  convert(request: ConvertRequest): Promise<EngineOutcome>;
  /** Creates and returns an empty, job-owned directory in the app cache. */
  createJobDirectory(): Promise<string>;
  /** Removes a job directory and everything in it; must not throw when absent. */
  removeDirectory(path: string): Promise<void>;
  /** Whether a path exists after the engine claims success. */
  fileExists(path: string): Promise<boolean>;
  /** Names already present in a directory, for collision resolution. */
  listDirectory(path: string): Promise<readonly string[]>;
  /** Joins a directory and a file name for the current platform. */
  joinPath(directory: string, name: string): string;
}

/** Set to true by the Cancel button; checked before each stage starts. */
export interface CancelSignal {
  cancelled: boolean;
}

export interface PreparedSource {
  readonly summary: MediaSummary;
  readonly encoderName: string;
}

interface ResolveOptions {
  readonly sourcePath: string;
  readonly preset: Preset;
  readonly ports: ConversionPorts;
}

type ResolveResult =
  | { readonly ok: true; readonly summary: MediaSummary; readonly choice: EncoderChoice | null }
  | { readonly ok: false; readonly summary: MediaSummary | null; readonly failure: Failure };

function isCancelled(signal: CancelSignal | undefined): boolean {
  return signal?.cancelled === true;
}

/** Probes the file, then resolves the encoder (and the size rules) it needs. */
async function resolveSource(options: ResolveOptions): Promise<ResolveResult> {
  const { sourcePath, preset, ports } = options;
  const probeResult = await ports.probe(sourcePath);

  if (!probeResult.ok || !probeResult.outcome.success) {
    return { ok: false, summary: null, failure: describeProbeFailure(probeResult.outcome) };
  }

  const summary = summariseProbe(probeResult.information);

  if (preset.kind === 'video' && !summary.hasVideo) {
    return {
      ok: false,
      summary,
      failure: {
        code: 'unsupported-source',
        title: 'No video found',
        message: `This file has no video stream, so ${preset.label} cannot be made from it.`,
        recovery: 'Choose a video file.',
      },
    };
  }

  if (preset.kind !== 'video') {
    return { ok: true, summary, choice: null };
  }

  const encoders = await ports.listEncoders();
  const choice = chooseVideoEncoder(preset, encoders);
  if (!choice.ok) {
    return { ok: false, summary, failure: describeMissingEncoder(choice.candidates) };
  }
  if (
    choice.hardware &&
    !meetsHardwareMinimum(summary.width ?? undefined, summary.height ?? undefined)
  ) {
    return {
      ok: false,
      summary,
      failure: describeSourceTooSmall(summary.width ?? 0, summary.height ?? 0),
    };
  }

  return { ok: true, summary, choice };
}

/** Removes the job directory once; later cleanup calls are no-ops. */
function createCleanup(ports: ConversionPorts) {
  let done = false;
  return async (directory: string | null): Promise<void> => {
    if (done || directory === null) {
      return;
    }
    done = true;
    await ports.removeDirectory(directory);
  };
}

export interface PrepareOptions {
  readonly source: SourceFile;
  readonly preset: Preset;
  readonly ports: ConversionPorts;
  readonly dispatch: (action: JobAction) => void;
  readonly cancelSignal?: CancelSignal;
}

export interface PrepareResult {
  readonly status: 'ready' | 'failed' | 'cancelled';
  readonly summary: MediaSummary | null;
  readonly failure: Failure | null;
}

/**
 * Probe a picked file and get the screen to `ready`.
 *
 * Nothing is written here, so a cancelled prepare has nothing to clean up.
 */
export async function prepareSource(options: PrepareOptions): Promise<PrepareResult> {
  const { source, preset, ports, dispatch, cancelSignal } = options;

  dispatch({ type: 'pick/started', source });

  const resolved = await resolveSource({ sourcePath: source.path, preset, ports });

  if (isCancelled(cancelSignal)) {
    dispatch({ type: 'pick/cancelled' });
    return { status: 'cancelled', summary: null, failure: null };
  }

  if (!resolved.ok) {
    dispatch({ type: 'probe/failed', failure: resolved.failure });
    return { status: 'failed', summary: resolved.summary, failure: resolved.failure };
  }

  dispatch({
    type: 'probe/succeeded',
    summary: resolved.summary,
    encoderName: resolved.choice?.ok === true ? resolved.choice.encoder : 'audio-only',
  });

  return { status: 'ready', summary: resolved.summary, failure: null };
}

export interface RunConversionOptions extends PrepareOptions {
  /** Summary from `prepareSource`, so the file is not probed twice. */
  readonly prepared?: PreparedSource;
  /** Wall clock, injected so elapsed time is testable. */
  readonly now?: () => number;
}

export interface ConversionResult {
  readonly status: 'done' | 'failed' | 'cancelled';
  readonly summary: MediaSummary | null;
  readonly outputPath: string | null;
  readonly failure: Failure | null;
}


export async function runConversion(options: RunConversionOptions): Promise<ConversionResult> {
  const { source, preset, ports, dispatch, cancelSignal, prepared } = options;
  const now = options.now ?? (() => Date.now());
  const cleanup = createCleanup(ports);

  dispatch({ type: 'pick/started', source });

  let summary: MediaSummary;
  let choice: EncoderChoice | null;

  if (prepared) {
    summary = prepared.summary;
    choice =
      prepared.encoderName === 'audio-only'
        ? null
        : {
            ok: true,
            encoder: prepared.encoderName,
            hardware: isHardwareEncoder(prepared.encoderName),
            pixelFormat: pixelFormatFor(prepared.encoderName),
          };
    dispatch({ type: 'probe/succeeded', summary, encoderName: prepared.encoderName });
  } else {
    const resolved = await resolveSource({ sourcePath: source.path, preset, ports });

    if (isCancelled(cancelSignal)) {
      dispatch({ type: 'convert/cancelled' });
      return { status: 'cancelled', summary: null, outputPath: null, failure: null };
    }
    if (!resolved.ok) {
      dispatch({ type: 'probe/failed', failure: resolved.failure });
      return {
        status: 'failed',
        summary: resolved.summary,
        outputPath: null,
        failure: resolved.failure,
      };
    }

    summary = resolved.summary;
    choice = resolved.choice;
    dispatch({
      type: 'probe/succeeded',
      summary,
      encoderName: choice?.ok === true ? choice.encoder : 'audio-only',
    });
  }

  if (isCancelled(cancelSignal)) {
    dispatch({ type: 'convert/cancelled' });
    return { status: 'cancelled', summary, outputPath: null, failure: null };
  }

  // Job directory, output name, argv.
  let jobDirectory: string | null = null;
  try {
    // Started before any preparation work so a failure in this block is
    // reported by the reducer instead of leaving the screen in "ready".
    dispatch({ type: 'convert/started' });

    jobDirectory = await ports.createJobDirectory();
    const existing = await ports.listDirectory(jobDirectory);
    const outputName = resolveCollision(buildOutputName(source.name, preset.extension), existing);
    const outputPath = ports.joinPath(jobDirectory, outputName);

    const argv = buildConversionArgv({
      preset,
      inputPath: source.path,
      outputPath,
      ...(choice?.ok === true
        ? { encoder: { encoder: choice.encoder, pixelFormat: choice.pixelFormat } }
        : {}),
      sourceHasAudio: summary.hasAudio,
    });

    let shownPercent = 0;
    const startedAt = now();
    const outcome = await ports.convert({
      argv,
      durationMs: summary.durationMs ?? undefined,
      onProgress: (processedMs) => {
        const sample = progressFromStatistics(
          shownPercent,
          processedMs,
          summary.durationMs ?? undefined,
        );
        shownPercent = sample.percent ?? shownPercent;
        dispatch({
          type: 'convert/progress',
          percent: sample.percent,
          elapsedMs: now() - startedAt,
        });
      },
      onSession: () => {
        // The session id lives in the adapter; Cancel asks the adapter to stop.
      },
    });

    if (outcome.cancelled) {
      await cleanup(jobDirectory);
      dispatch({ type: 'convert/cancelled' });
      return { status: 'cancelled', summary, outputPath: null, failure: null };
    }

    const failure = describeEngineOutcome(outcome);
    if (failure) {
      await cleanup(jobDirectory);
      dispatch({ type: 'convert/failed', failure });
      return { status: 'failed', summary, outputPath: null, failure };
    }

    if (!(await ports.fileExists(outputPath))) {
      await cleanup(jobDirectory);
      const missing: Failure = {
        code: 'output-missing',
        title: 'No output file',
        message: 'The engine reported success, but the output file is not there.',
        recovery: 'Try again. If it keeps happening, report the file you used.',
        detail: `Expected: ${sanitizeBaseName(outputName)}`,
      };
      dispatch({ type: 'convert/failed', failure: missing });
      return { status: 'failed', summary, outputPath: null, failure: missing };
    }

    // Success keeps the directory: in Phase 1 that file is the only copy.
    dispatch({ type: 'convert/succeeded', output: { name: outputName, path: outputPath } });
    return { status: 'done', summary, outputPath, failure: null };
  } catch (error) {
    await cleanup(jobDirectory);
    const failure: Failure =
      error instanceof InvalidCommandError
        ? {
            code: 'engine-failed',
            title: 'Could not build the command',
            message: error.message,
            recovery: 'Pick the file again. This message is worth reporting.',
          }
        : {
            code: 'engine-failed',
            title: 'Conversion failed',
            message: 'The app could not finish this conversion.',
            recovery: 'Try again, or pick a different file.',
            ...(error instanceof Error && error.message ? { detail: error.message } : {}),
          };
    dispatch({ type: 'convert/failed', failure });
    return { status: 'failed', summary, outputPath: null, failure };
  }
}


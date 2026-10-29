/**
 * Extracting one embedded subtitle track to a text file.
 *
 * A separate job from a conversion because it writes no media: one input, one
 * stream map, one text file. It reuses the same ports, the same job-directory
 * rule, and the same cleanup discipline — a failed or cancelled extraction
 * removes its directory, a successful one keeps the only copy (D1, TR-08).
 */

import { describeExtractionFailure, type Failure } from '../domain/errors';
import { buildExtractionArgv, InvalidCommandError } from '../domain/ffmpegCommand';
import { resolveCollision } from '../domain/naming';
import type { SubtitleAction, ExtractedSubtitleFile } from '../domain/subtitleIntent';
import { subtitleOutputName, type SubtitleFormat } from '../domain/subtitles';
import type { CancelSignal, ConversionPorts } from './runConversion';

/** The subset of the conversion ports an extraction needs. */
export type ExtractionPorts = Pick<
  ConversionPorts,
  'convert' | 'createJobDirectory' | 'removeDirectory' | 'fileExists' | 'listDirectory' | 'joinPath'
>;

export interface ExtractOptions {
  /** The file the track is read from; the picked source in the app cache. */
  readonly sourcePath: string;
  /** Its display name, which the subtitle file is named after. */
  readonly sourceName: string;
  /** 0-based position among the source's subtitle streams. */
  readonly streamIndex: number;
  readonly format: SubtitleFormat;
  readonly ports: ExtractionPorts;
  readonly dispatch: (action: SubtitleAction) => void;
  readonly cancelSignal?: CancelSignal;
}

export type ExtractOutcome =
  | { readonly status: 'done'; readonly output: ExtractedSubtitleFile }
  | { readonly status: 'failed'; readonly failure: Failure };

/**
 * Copies one subtitle stream out to `.srt` or `.vtt`.
 *
 * The engine is given no progress callback: a text copy finishes in well under a
 * second, and a percentage for it would only flicker. Nothing is reported as
 * done until the file is confirmed to exist, so "Extracted" is never shown over
 * an operation that wrote nothing.
 */
export async function extractSubtitles(options: ExtractOptions): Promise<ExtractOutcome> {
  const { sourcePath, sourceName, streamIndex, format, ports, dispatch, cancelSignal } = options;

  dispatch({ type: 'extract/started' });

  let jobDirectory: string | null = null;

  try {
    jobDirectory = await ports.createJobDirectory();
    const existing = await ports.listDirectory(jobDirectory);
    const outputName = resolveCollision(subtitleOutputName(sourceName, format), existing);
    const outputPath = ports.joinPath(jobDirectory, outputName);

    if (cancelSignal?.cancelled === true) {
      await ports.removeDirectory(jobDirectory);
      const cancelled: Failure = {
        code: 'extraction-failed',
        title: 'Extraction cancelled',
        message: 'Extracting the subtitles was cancelled before it started.',
        recovery: 'Extract the subtitles again when you are ready.',
      };
      dispatch({ type: 'extract/failed', failure: cancelled });
      return { status: 'failed', failure: cancelled };
    }

    const argv = buildExtractionArgv({ inputPath: sourcePath, outputPath, streamIndex, format });
    const outcome = await ports.convert({
      argv,
      durationMs: undefined,
      onProgress: () => {
        // A text copy reports no useful percentage.
      },
      onSession: () => {
        // The adapter owns the session; Cancel for extractions is the screen's.
      },
    });

    if (!outcome.success || outcome.cancelled) {
      await ports.removeDirectory(jobDirectory);
      const failure = describeExtractionFailure(outcome);
      dispatch({ type: 'extract/failed', failure });
      return { status: 'failed', failure };
    }

    if (!(await ports.fileExists(outputPath))) {
      await ports.removeDirectory(jobDirectory);
      const missing: Failure = {
        code: 'output-missing',
        title: 'No subtitle file',
        message: 'The engine reported success, but the subtitle file is not there.',
        recovery: 'Extract again. If it keeps happening, report the file you used.',
        detail: `Expected: ${outputName}`,
      };
      dispatch({ type: 'extract/failed', failure: missing });
      return { status: 'failed', failure: missing };
    }

    const output: ExtractedSubtitleFile = { name: outputName, path: outputPath };
    dispatch({ type: 'extract/succeeded', output });
    return { status: 'done', output };
  } catch (error) {
    if (jobDirectory !== null) {
      await ports.removeDirectory(jobDirectory);
    }
    const failure: Failure =
      error instanceof InvalidCommandError
        ? {
            code: 'extraction-failed',
            title: 'Could not build the command',
            message: error.message,
            recovery: 'Pick the file again. This message is worth reporting.',
          }
        : {
            code: 'extraction-failed',
            title: 'Could not extract subtitles',
            message: 'The app could not finish extracting the subtitles.',
            recovery: 'Try again, or pick a different file.',
            ...(error instanceof Error && error.message ? { detail: error.message } : {}),
          };
    dispatch({ type: 'extract/failed', failure });
    return { status: 'failed', failure };
  }
}

/**
 * Failure presentation.
 *
 * Every failure gets a stable code, a sentence that says what happened, and a
 * next step. Nothing here returns the word "Error" on its own, and an unmapped
 * engine exit code is shown rather than swallowed (TR-30).
 */

export type FailureCode =
  | 'pick-cancelled'
  | 'pick-failed'
  | 'probe-failed'
  | 'unsupported-source'
  | 'no-encoder'
  | 'source-too-small'
  | 'engine-failed'
  | 'conversion-cancelled'
  | 'output-missing';

export interface Failure {
  readonly code: FailureCode;
  readonly title: string;
  /** What happened, in one sentence. */
  readonly message: string;
  /** What the user can do next. */
  readonly recovery: string;
  /** Raw engine text and exit code, shown only in the Details expander. */
  readonly detail?: string;
}

/** The part of `FFmpegSessionResult` this module reads. */
export interface EngineOutcome {
  readonly success: boolean;
  readonly cancelled: boolean;
  readonly returnCode: number;
  readonly output: string;
}

/** Last non-empty line of the engine log, which is where FFmpeg writes the cause. */
export function lastMeaningfulLine(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? '' : lines[lines.length - 1];
}

function withDetail(failure: Failure, output: string, returnCode: number): Failure {
  const line = lastMeaningfulLine(output);
  return { ...failure, detail: `Exit code ${returnCode}${line ? `: ${line}` : ''}` };
}

/**
 * Maps one engine result to the message the screen shows.
 *
 * Returns `null` when the engine actually succeeded, so callers branch on a
 * single value instead of repeating three flags.
 */
export function describeEngineOutcome(outcome: EngineOutcome): Failure | null {
  if (outcome.cancelled) {
    return {
      code: 'conversion-cancelled',
      title: 'Cancelled',
      message: 'The conversion was cancelled, and its temporary files were removed.',
      recovery: 'Choose the file again to start a new conversion.',
    };
  }

  if (outcome.success) {
    return null;
  }

  const output = outcome.output ?? '';
  const text = output.toLowerCase();

  if (text.includes('no space left')) {
    return withDetail(
      {
        code: 'engine-failed',
        title: 'Not enough space',
        message: 'The device ran out of storage while writing the output.',
        recovery: 'Free up space, then try again.',
      },
      output,
      outcome.returnCode,
    );
  }

  if (text.includes('permission denied') || text.includes('operation not permitted')) {
    return withDetail(
      {
        code: 'probe-failed',
        title: 'Could not read the file',
        message: 'Android refused access to the selected file.',
        recovery: 'Pick the file again and keep it available until the conversion finishes.',
      },
      output,
      outcome.returnCode,
    );
  }

  if (
    text.includes('invalid data found') ||
    text.includes('could not find codec parameters') ||
    text.includes('moov atom not found')
  ) {
    return withDetail(
      {
        code: 'unsupported-source',
        title: 'Unsupported file',
        message: 'The engine could not find video or audio it can read in this file.',
        recovery: 'Choose a different file, or convert it with another app first.',
      },
      output,
      outcome.returnCode,
    );
  }

  if (text.includes('unknown encoder') || text.includes('encoder not found')) {
    return withDetail(
      {
        code: 'no-encoder',
        title: 'Encoder unavailable',
        message: 'This build of the engine cannot encode one of the streams in this file.',
        recovery: 'Try another file. Report this if it happens with every file.',
      },
      output,
      outcome.returnCode,
    );
  }

  return withDetail(
    {
      code: 'engine-failed',
      title: 'Conversion failed',
      message: `The engine stopped with exit code ${outcome.returnCode}.`,
      recovery: 'Open Details and report the code, or try a different file.',
    },
    output,
    outcome.returnCode,
  );
}

/** A failed probe means the file is unreadable, not that the app broke. */
export function describeProbeFailure(outcome: EngineOutcome): Failure {
  return (
    describeEngineOutcome({ ...outcome, success: false, cancelled: false }) ?? {
      code: 'probe-failed',
      title: 'Could not read the file',
      message: 'The engine could not inspect this file.',
      recovery: 'Choose a different file.',
    }
  );
}

/** The provider's own refusal to hand the file over (TR-05). */
export function describePickFailure(error: unknown): Failure {
  const message = error instanceof Error && error.message ? error.message : '';
  return {
    code: 'pick-failed',
    title: 'File not available',
    message:
      'The app could not copy the selected file. Some cloud providers withdraw access before the copy finishes.',
    recovery: 'Download the file to the device first, then choose it here.',
    ...(message ? { detail: message } : {}),
  };
}

/** No encoder for the preset, which is a build capability gap, not a user mistake. */
export function describeMissingEncoder(candidates: readonly string[]): Failure {
  return {
    code: 'no-encoder',
    title: 'Encoder unavailable',
    message: 'This build of the engine has no encoder for the selected format.',
    recovery: 'Report which format you chose. The app will not fall back to a different output.',
    detail: `Needed one of: ${candidates.join(', ')}`,
  };
}

/** Hardware H.264 rejects frames below 176×144. */
export function describeSourceTooSmall(width: number, height: number): Failure {
  return {
    code: 'source-too-small',
    title: 'File too small to convert',
    message: `The video is ${width}×${height}, and the device encoder needs at least 176×144.`,
    recovery: 'Choose a larger video.',
  };
}

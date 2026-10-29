/**
 * Failure presentation.
 *
 * Every failure gets a stable code, a sentence that says what happened, and a
 * next step. Nothing here returns the word "Error" on its own, and an unmapped
 * engine exit code is shown rather than swallowed (TR-30).
 */

import type { SidecarProblemDetail } from './subtitles';

export type FailureCode =
  | 'pick-cancelled'
  | 'pick-failed'
  | 'probe-failed'
  | 'unsupported-source'
  | 'no-encoder'
  | 'source-too-small'
  | 'engine-failed'
  | 'conversion-cancelled'
  | 'save-failed'
  | 'output-missing'
  | 'subtitle-invalid'
  | 'subtitle-pick-failed'
  | 'subtitle-unsupported'
  | 'extraction-failed'
  | 'no-subtitle-track';

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

/**
 * A failure the code did not anticipate: an exception escaping the pipeline.
 *
 * The batch needs this because a row that throws must still leave a terminal
 * state with a reason attached; an exception with no message is not worth
 * showing, so the detail appears only when there is something in it.
 */
export function describeUnexpectedFailure(error: unknown): Failure {
  const message = error instanceof Error && error.message ? error.message : '';
  return {
    code: 'engine-failed',
    title: 'Conversion failed',
    message: 'The app could not finish this conversion.',
    recovery: 'Try again, or pick a different file.',
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

/** Where a finished conversion is being copied to. */
export type SaveDestination = 'photos' | 'folder';

/**
 * Android files audio under the Music library and video under Photos; both are
 * the same MediaStore destination, so the messages say "media library" and let
 * the success line name the exact place.
 */
const DESTINATION_LABEL: Record<SaveDestination, string> = {
  photos: 'the media library',
  folder: 'the folder you chose',
};

/**
 * A finished conversion is already safe in the app cache, so a refused copy is
 * an annoyance rather than a lost file — and every message here says so, because
 * that is the reassurance the user needs (TR-30).
 */
export function describeSaveFailure(error: unknown, destination: SaveDestination): Failure {
  const message = error instanceof Error && error.message ? error.message : String(error ?? '');
  const text = message.toLowerCase();
  const detail = message ? { detail: message } : {};

  if (text.includes('no space') || text.includes('enospc') || text.includes('disk full')) {
    return {
      code: 'save-failed',
      title: 'Not enough space',
      message: `The device ran out of storage while copying the file to ${DESTINATION_LABEL[destination]}.`,
      recovery: 'Free up space, then save again. The converted file is still in the app cache.',
      ...detail,
    };
  }

  if (text.includes('permission') || text.includes('denied')) {
    return {
      code: 'save-failed',
      title: 'Access refused',
      message: `Android did not allow the app to write to ${DESTINATION_LABEL[destination]}.`,
      recovery:
        destination === 'photos'
          ? 'Allow media access for this app in Settings, or save a copy to a folder instead.'
          : 'Choose a folder the app may write to, such as Downloads or Documents. The file is still in the app cache.',
      ...detail,
    };
  }

  return destination === 'photos'
    ? {
        code: 'save-failed',
        title: 'Could not add to the library',
        message: 'The device media library did not accept the converted file.',
        recovery:
          'The file is still in the app cache. Save a copy to a folder to keep it somewhere else.',
        ...detail,
      }
    : {
        code: 'save-failed',
        title: 'Could not save to that folder',
        message: 'Android refused to copy the file into the folder you chose.',
        recovery: 'Choose another folder and try again. The file is still in the app cache.',
        ...detail,
      };
}

/**
 * A subtitle file aimed at the photo library.
 *
 * MediaStore indexes photos, video, and audio; a plain-text sidecar has no
 * collection to join. The request is refused here, with the next step named,
 * rather than handed to a library that can only answer with a generic error.
 */
export function describeTextSaveUnsupported(): Failure {
  return {
    code: 'save-failed',
    title: 'Photos cannot take a text file',
    message:
      'The media library stores photos, video, and audio only, so a subtitle file cannot be added to it.',
    recovery: 'Save the subtitle file to a folder instead, and pick Downloads or Documents.',
  };
}

// ---------------------------------------------------------------------------
// Subtitles (Phase 6)
// ---------------------------------------------------------------------------

/**
 * Why a sidecar was refused, said in terms of the file the user just picked.
 *
 * Every branch names the file and the next step, because "invalid file" on its
 * own would leave the user guessing which of several things went wrong (D3).
 */
export function describeSidecarProblem(
  problem: SidecarProblemDetail,
  fileName: string,
): Failure {
  const where = problem.line === null ? '' : ` on line ${problem.line}`;

  switch (problem.problem) {
    case 'wrong-type':
      return {
        code: 'subtitle-invalid',
        title: 'Not a subtitle file',
        message: `${fileName} is not a subtitle file. This build embeds SubRip (.srt) files.`,
        recovery: 'Choose a file whose name ends in .srt.',
      };
    case 'empty':
      return {
        code: 'subtitle-invalid',
        title: 'Subtitle file is empty',
        message: `${fileName} has no text in it.`,
        recovery: 'Choose a subtitle file that contains at least one timed line.',
      };
    case 'binary':
      return {
        code: 'subtitle-invalid',
        title: 'Subtitle file is not text',
        message: `${fileName} contains binary data, so it cannot be read as subtitles.`,
        recovery: 'Choose the subtitle file itself, not a video or a compressed file.',
      };
    case 'no-cues':
      return {
        code: 'subtitle-invalid',
        title: 'No cue times found',
        message: `${fileName} has text but no cue times, so the track would be empty.`,
        recovery: 'Choose a subtitle file whose lines are timed, like a normal .srt file.',
      };
    case 'bad-timing':
      return {
        code: 'subtitle-invalid',
        title: 'Cue times are unreadable',
        message: `${fileName} has a cue${where} whose times cannot be read.`,
        recovery: 'Open the file in a subtitle editor, re-save it as SubRip, then choose it again.',
        detail: 'Cue times look like: 00:00:12,480 --> 00:00:15,000 (the end must be after the start).',
      };
    default: {
      const unhandled: never = problem.problem;
      return {
        code: 'subtitle-invalid',
        title: 'Subtitle file refused',
        message: `${fileName} was refused for an unlisted reason (${String(unhandled)}).`,
        recovery: 'Choose the file again, or report this message.',
      };
    }
  }
}

/** The picker or the cache refused the sidecar before it could be read. */
export function describeSubtitlePickFailure(error: unknown): Failure {
  const message = error instanceof Error && error.message ? error.message : '';
  return {
    code: 'subtitle-pick-failed',
    title: 'Subtitle file not available',
    message: 'The app could not read the subtitle file you chose.',
    recovery: 'Download the file to the device first, then choose it again.',
    ...(message ? { detail: message } : {}),
  };
}

/** A sidecar on a preset whose container has no subtitle stream. */
export function describeSubtitleUnsupported(presetLabel: string): Failure {
  return {
    code: 'subtitle-unsupported',
    title: 'This format cannot hold subtitles',
    message: `${presetLabel} has no subtitle stream, so the subtitle file cannot be added to it.`,
    recovery: 'Choose MP4, MKV, MOV, or WEBM, or remove the subtitle file.',
  };
}

/** Extraction found nothing to copy, so the file stays as it was. */
export function describeNoSubtitleTrack(): Failure {
  return {
    code: 'no-subtitle-track',
    title: 'No subtitle track',
    message: 'This file has no subtitle track inside it, so there is nothing to extract.',
    recovery: 'Pick a different file, or embed a subtitle file into a conversion instead.',
  };
}

/**
 * A failed extraction, with the engine's own words in Details.
 *
 * Separate from `describeEngineOutcome` because nothing was converted: saying
 * "Conversion failed" for a one-stream copy would name the wrong operation.
 */
export function describeExtractionFailure(outcome: EngineOutcome): Failure {
  if (outcome.cancelled) {
    return {
      code: 'extraction-failed',
      title: 'Extraction cancelled',
      message: 'Extracting the subtitles was cancelled, and its temporary files were removed.',
      recovery: 'Extract the subtitles again when you are ready.',
    };
  }

  const output = outcome.output ?? '';
  const text = output.toLowerCase();

  if (
    text.includes('matches no streams') ||
    text.includes('does not contain any stream') ||
    text.includes('invalid stream specifier')
  ) {
    return withDetail(describeNoSubtitleTrack(), output, outcome.returnCode);
  }

  if (text.includes('no space left')) {
    return withDetail(
      {
        code: 'extraction-failed',
        title: 'Not enough space',
        message: 'The device ran out of storage while writing the subtitle file.',
        recovery: 'Free up space, then extract again.',
      },
      output,
      outcome.returnCode,
    );
  }

  return withDetail(
    {
      code: 'extraction-failed',
      title: 'Could not extract subtitles',
      message: `The engine stopped with exit code ${outcome.returnCode} before writing the subtitles.`,
      recovery: 'Open Details and report the code, or try a different file.',
    },
    output,
    outcome.returnCode,
  );
}

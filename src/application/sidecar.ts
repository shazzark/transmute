/**
 * Choosing and validating a subtitle sidecar.
 *
 * The engine is never asked to read a file that this layer has already refused:
 * a malformed sidecar is reported before a job directory exists, so a rejection
 * costs nothing and leaves nothing behind (Phase 6 acceptance 3).
 *
 * Every dependency is a port, so the whole flow — including a cancelled picker
 * and an unreadable file — is tested with fakes and no native module (TR-24).
 */

import {
  describeSidecarProblem,
  describeSubtitlePickFailure,
  type Failure,
} from '../domain/errors';
import type { SubtitleAction } from '../domain/subtitleIntent';
import { validateSidecar, type ValidatedSidecar } from '../domain/subtitles';

/** The file the picker handed back: a cache path plus the provider's name. */
export interface SidecarFile {
  readonly path: string;
  readonly name: string;
}

export type SidecarPickOutcome =
  | { readonly status: 'picked'; readonly file: SidecarFile }
  /** The picker was closed without a file. */
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: unknown };

export interface SidecarPorts {
  pickSidecarFile(): Promise<SidecarPickOutcome>;
  /** Whole file as UTF-8 text; rejects when the file cannot be read. */
  readTextFile(path: string): Promise<string>;
}

export interface ChooseSidecarOptions {
  readonly ports: SidecarPorts;
  readonly dispatch: (action: SubtitleAction) => void;
}

export type SidecarOutcome =
  | { readonly status: 'ready'; readonly sidecar: ValidatedSidecar }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly failure: Failure };

/**
 * Picks a sidecar, reads it, and validates it.
 *
 * A cancelled pick is not a failure and does not clear a sidecar that was already
 * chosen, because the user asked for the picker, not for a reset. Every other
 * outcome settles the state: a refusal drops the previous choice, since the file
 * the user just picked is the one they meant.
 */
export async function chooseSidecar(options: ChooseSidecarOptions): Promise<SidecarOutcome> {
  const { ports, dispatch } = options;

  dispatch({ type: 'sidecar/choosing' });

  let pick: SidecarPickOutcome;
  try {
    pick = await ports.pickSidecarFile();
  } catch (error) {
    const failure = describeSubtitlePickFailure(error);
    dispatch({ type: 'sidecar/failed', failure });
    return { status: 'failed', failure };
  }

  if (pick.status === 'cancelled') {
    dispatch({ type: 'sidecar/choosingCancelled' });
    return { status: 'cancelled' };
  }

  if (pick.status === 'failed') {
    const failure = describeSubtitlePickFailure(pick.error);
    dispatch({ type: 'sidecar/failed', failure });
    return { status: 'failed', failure };
  }

  let text: string;
  try {
    text = await ports.readTextFile(pick.file.path);
  } catch (error) {
    const failure = describeSubtitlePickFailure(error);
    dispatch({ type: 'sidecar/failed', failure });
    return { status: 'failed', failure };
  }

  const validation = validateSidecar({ name: pick.file.name, text });
  if (!validation.ok) {
    const failure = describeSidecarProblem(validation, pick.file.name);
    dispatch({ type: 'sidecar/failed', failure });
    return { status: 'failed', failure };
  }

  const sidecar: ValidatedSidecar = {
    path: pick.file.path,
    name: pick.file.name,
    format: validation.format,
    cueCount: validation.cueCount,
    firstCueLabel: validation.firstCueLabel,
    lastCueLabel: validation.lastCueLabel,
  };
  dispatch({ type: 'sidecar/ready', sidecar });
  return { status: 'ready', sidecar };
}

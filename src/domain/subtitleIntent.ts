/**
 * Subtitle state.
 *
 * Embedding and extracting are separate facts, so they are tracked separately: a
 * failed extraction must not discard the sidecar the user chose, and clearing a
 * sidecar must not pretend the extracted file is gone (Phase 6 acceptance 5).
 *
 * Pure, like the job reducer, so every combination of the two is testable in
 * Node (TR-21).
 */

import type { Failure } from './errors';
import type { SubtitleFormat, ValidatedSidecar } from './subtitles';

/** A written subtitle file in the app cache, with the name it was given. */
export interface ExtractedSubtitleFile {
  readonly name: string;
  readonly path: string;
}

/** Picking and validating a sidecar file to embed. */
export type SidecarStatus = 'absent' | 'choosing' | 'ready' | 'failed';

/** Copying an embedded track out to a text file. */
export type ExtractionStatus = 'idle' | 'running' | 'done' | 'failed';

export interface SubtitleState {
  readonly sidecarStatus: SidecarStatus;
  /** The validated sidecar to embed; `null` when none is chosen. */
  readonly sidecar: ValidatedSidecar | null;
  readonly sidecarFailure: Failure | null;
  readonly extractionStatus: ExtractionStatus;
  /** The format the user wants the extracted text in; SRT until they say otherwise. */
  readonly extractionFormat: SubtitleFormat;
  /** The written subtitle file, in the app cache. */
  readonly extractionOutput: ExtractedSubtitleFile | null;
  readonly extractionFailure: Failure | null;
}

export const initialSubtitleState: SubtitleState = {
  sidecarStatus: 'absent',
  sidecar: null,
  sidecarFailure: null,
  extractionStatus: 'idle',
  extractionFormat: 'srt',
  extractionOutput: null,
  extractionFailure: null,
};

export type SubtitleAction =
  | { readonly type: 'sidecar/choosing' }
  | { readonly type: 'sidecar/ready'; readonly sidecar: ValidatedSidecar }
  | { readonly type: 'sidecar/cleared' }
  | { readonly type: 'sidecar/failed'; readonly failure: Failure }
  /** The picker was closed without a file: not a failure, and no change of mind. */
  | { readonly type: 'sidecar/choosingCancelled' }
  | { readonly type: 'extract/formatSelected'; readonly format: SubtitleFormat }
  | { readonly type: 'extract/started' }
  | { readonly type: 'extract/succeeded'; readonly output: ExtractedSubtitleFile }
  | { readonly type: 'extract/failed'; readonly failure: Failure }
  | { readonly type: 'subtitles/reset' };

/** True while the picker or the engine is working, so both buttons are disabled. */
export function isSubtitleBusy(state: SubtitleState): boolean {
  return state.sidecarStatus === 'choosing' || state.extractionStatus === 'running';
}

/**
 * Applies one subtitle action.
 *
 * The sidecar and the extraction are guarded independently: an extraction result
 * cannot overwrite a sidecar choice, and a failed sidecar pick cannot erase the
 * file a previous extraction produced.
 */
export function subtitleReducer(state: SubtitleState, action: SubtitleAction): SubtitleState {
  switch (action.type) {
    case 'sidecar/choosing':
      return { ...state, sidecarStatus: 'choosing', sidecarFailure: null };

    case 'sidecar/ready':
      if (state.sidecarStatus !== 'choosing') {
        return state;
      }
      return {
        ...state,
        sidecarStatus: 'ready',
        sidecar: action.sidecar,
        sidecarFailure: null,
      };

    case 'sidecar/cleared':
      if (state.sidecarStatus === 'choosing') {
        return state;
      }
      return { ...state, sidecarStatus: 'absent', sidecar: null, sidecarFailure: null };

    case 'sidecar/failed':
      // The file the user just chose is the one they meant, so a rejection drops
      // the previous sidecar instead of leaving a stale one on screen.
      return { ...state, sidecarStatus: 'failed', sidecar: null, sidecarFailure: action.failure };

    case 'sidecar/choosingCancelled':
      if (state.sidecarStatus !== 'choosing') {
        return state;
      }
      return {
        ...state,
        sidecarStatus: state.sidecar === null ? 'absent' : 'ready',
        sidecarFailure: null,
      };

    case 'extract/formatSelected':
      if (state.extractionStatus === 'running') {
        return state;
      }
      // A finished file was written in the old format, so the label it is shown
      // under goes back to "not extracted yet".
      return {
        ...state,
        extractionFormat: action.format,
        extractionStatus: 'idle',
        extractionOutput: null,
        extractionFailure: null,
      };

    case 'extract/started':
      if (state.extractionStatus === 'running') {
        return state;
      }
      return { ...state, extractionStatus: 'running', extractionFailure: null };

    case 'extract/succeeded':
      if (state.extractionStatus !== 'running') {
        return state;
      }
      return {
        ...state,
        extractionStatus: 'done',
        extractionOutput: action.output,
        extractionFailure: null,
      };

    case 'extract/failed':
      if (state.extractionStatus !== 'running') {
        return state;
      }
      return { ...state, extractionStatus: 'failed', extractionFailure: action.failure };

    case 'subtitles/reset':
      return initialSubtitleState;

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

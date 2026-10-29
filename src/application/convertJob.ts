/**
 * Job state machine.
 *
 * Pure reducer: given a state and an action, the next state. No I/O, no React
 * Native imports, so every transition — including cancel from every status — is
 * testable in Node (TR-21, TR-11).
 */

import type { Failure } from '../domain/errors';
import type { MediaSummary } from '../domain/probe';
import { DEFAULT_PRESET_ID, type PresetId } from '../domain/presets';
import type { OutputFile, SourceFile } from '../domain/mediaFiles';

/**
 * Re-exported so the many call sites that already import the file shapes from
 * here keep working: the shapes moved to the domain when the queue needed them,
 * and the domain may not import from this layer.
 */
export type { OutputFile, SourceFile } from '../domain/mediaFiles';

export type JobStatus =
  | 'idle'
  | 'probing'
  | 'ready'
  | 'converting'
  | 'cancelling'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface JobState {
  readonly status: JobStatus;
  readonly source: SourceFile | null;
  readonly summary: MediaSummary | null;
  readonly presetId: PresetId;
  /** Encoder the build resolved for this job, e.g. `h264_mediacodec`. */
  readonly encoderName: string | null;
  /** Whole percent of the source processed; monotonic inside one job. */
  readonly progress: number;
  /** True while the duration is unknown, so the bar shows movement, not a number. */
  readonly indeterminate: boolean;
  readonly elapsedMs: number;
  readonly output: OutputFile | null;
  readonly failure: Failure | null;
}

export const initialJobState: JobState = {
  status: 'idle',
  source: null,
  summary: null,
  presetId: DEFAULT_PRESET_ID,
  encoderName: null,
  progress: 0,
  indeterminate: true,
  elapsedMs: 0,
  output: null,
  failure: null,
};

export type JobAction =
  | { readonly type: 'pick/started'; readonly source: SourceFile }
  | { readonly type: 'pick/cancelled' }
  | { readonly type: 'pick/failed'; readonly failure: Failure }
  | { readonly type: 'probe/succeeded'; readonly summary: MediaSummary; readonly encoderName: string }
  | { readonly type: 'probe/failed'; readonly failure: Failure }
  | { readonly type: 'preset/selected'; readonly presetId: PresetId }
  | { readonly type: 'convert/started' }
  | { readonly type: 'convert/progress'; readonly percent: number | null; readonly elapsedMs: number }
  | { readonly type: 'convert/succeeded'; readonly output: OutputFile }
  | { readonly type: 'convert/failed'; readonly failure: Failure }
  | { readonly type: 'convert/cancelRequested' }
  | { readonly type: 'convert/cancelled' }
  | { readonly type: 'reset' };

/** True while the engine is working, so the UI disables Convert and offers Cancel. */
export function isBusy(status: JobStatus): boolean {
  return status === 'probing' || status === 'converting' || status === 'cancelling';
}

/** Convert is offered once a probed file is in hand; a terminal state keeps it. */
export function canConvert(state: JobState): boolean {
  if (state.summary === null || state.source === null) {
    return false;
  }
  return (
    state.status === 'ready' ||
    state.status === 'done' ||
    state.status === 'failed' ||
    state.status === 'cancelled'
  );
}

export function jobReducer(state: JobState, action: JobAction): JobState {
  switch (action.type) {
    case 'pick/started':
      return {
        ...initialJobState,
        presetId: state.presetId,
        status: 'probing',
        source: action.source,
      };

    case 'pick/cancelled':
      // A cancelled picker is a "no file" state, not a failure.
      return { ...initialJobState, presetId: state.presetId };

    case 'pick/failed':
      return {
        ...initialJobState,
        presetId: state.presetId,
        status: 'failed',
        failure: action.failure,
      };

    case 'probe/succeeded':
      if (state.source === null) {
        return state;
      }
      return {
        ...state,
        status: 'ready',
        summary: action.summary,
        encoderName: action.encoderName,
        failure: null,
        output: null,
        progress: 0,
        elapsedMs: 0,
        indeterminate: action.summary.durationMs === null,
      };

    case 'probe/failed':
      return { ...state, status: 'failed', summary: null, failure: action.failure };

    case 'preset/selected':
      if (isBusy(state.status)) {
        return state;
      }
      // The encoder was resolved for the previous format, so it is dropped: the
      // next job resolves one for the new preset instead of reusing a name that
      // may not even belong to this container (TD-8).
      return { ...state, presetId: action.presetId, encoderName: null };

    case 'convert/started':
      if (state.source === null || state.summary === null) {
        return state;
      }
      return {
        ...state,
        status: 'converting',
        progress: 0,
        elapsedMs: 0,
        output: null,
        failure: null,
        indeterminate: state.summary.durationMs === null,
      };

    case 'convert/progress': {
      if (state.status !== 'converting' && state.status !== 'cancelling') {
        return state;
      }
      const percent =
        action.percent === null
          ? state.progress
          : Math.max(state.progress, Math.min(100, action.percent));
      return {
        ...state,
        progress: percent,
        elapsedMs: Math.max(state.elapsedMs, action.elapsedMs),
        indeterminate: action.percent === null,
      };
    }

    case 'convert/succeeded':
      if (state.status !== 'converting' && state.status !== 'cancelling') {
        return state;
      }
      return {
        ...state,
        status: 'done',
        output: action.output,
        // The bar is full before the success state appears, never after (TR-04).
        progress: 100,
        indeterminate: false,
        failure: null,
      };

    case 'convert/failed':
      if (state.status !== 'converting' && state.status !== 'cancelling') {
        return state;
      }
      return { ...state, status: 'failed', failure: action.failure, output: null };

    case 'convert/cancelRequested':
      if (state.status !== 'converting') {
        return state;
      }
      return { ...state, status: 'cancelling' };

    case 'convert/cancelled':
      // Idempotent: a second cancel signal changes nothing.
      if (state.status !== 'converting' && state.status !== 'cancelling') {
        return state;
      }
      return {
        ...state,
        status: 'cancelled',
        output: null,
        indeterminate: false,
        failure: null,
      };

    case 'reset':
      return { ...initialJobState, presetId: state.presetId };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

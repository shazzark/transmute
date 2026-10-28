/**
 * Save state.
 *
 * A conversion leaves the new file in the app's own cache, which nobody can find
 * in a file manager and which the system may clear. This module owns what the
 * screen says about getting a copy out: into the photo library, into a folder
 * the user picks, or nowhere yet.
 *
 * Two destinations are tracked separately because they are independent facts —
 * saving to a folder must not make the app claim the file is already in Photos.
 * Pure, so every combination is testable in Node (TR-21).
 */

import type { Failure, SaveDestination } from './errors';

/** The same two destinations the failure messages talk about. */
export type SaveTarget = SaveDestination;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface SaveState {
  readonly status: SaveStatus;
  /** The destination of the attempt in flight, or of the last one. */
  readonly target: SaveTarget;
  /** Where the copy landed, per destination; `null` until it lands. */
  readonly photos: string | null;
  readonly folder: string | null;
  /** The last failed attempt, cleared by the next one. */
  readonly failure: Failure | null;
}

export const initialSaveState: SaveState = {
  status: 'idle',
  target: 'photos',
  photos: null,
  folder: null,
  failure: null,
};

export type SaveAction =
  | { readonly type: 'save/started'; readonly target: SaveTarget }
  | { readonly type: 'save/succeeded'; readonly location: string }
  | { readonly type: 'save/failed'; readonly failure: Failure }
  /** The folder picker was closed without choosing: not a failure, not a result. */
  | { readonly type: 'save/skipped' }
  | { readonly type: 'save/reset' };

export function saveReducer(state: SaveState, action: SaveAction): SaveState {
  switch (action.type) {
    case 'save/started':
      return { ...state, status: 'saving', target: action.target, failure: null };

    case 'save/succeeded': {
      if (state.status !== 'saving') {
        return state;
      }
      const landed =
        state.target === 'photos'
          ? { photos: action.location }
          : { folder: action.location };
      return { ...state, status: 'saved', failure: null, ...landed };
    }

    case 'save/failed':
      if (state.status !== 'saving') {
        return state;
      }
      return { ...state, status: 'failed', failure: action.failure };

    case 'save/skipped':
      if (state.status !== 'saving') {
        return state;
      }
      return { ...state, status: 'idle', failure: null };

    case 'save/reset':
      return initialSaveState;

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** True while a copy is running, so both save buttons stay disabled. */
export function isSaving(state: SaveState): boolean {
  return state.status === 'saving';
}

/** Where a destination's copy already landed, or `null`. */
export function savedLocation(state: SaveState, target: SaveTarget): string | null {
  return target === 'photos' ? state.photos : state.folder;
}

/** The destination in a sentence: `Saving to Photos…`, `Saving to a folder…`. */
export function targetLabel(target: SaveTarget): string {
  return target === 'photos' ? 'Photos' : 'a folder';
}

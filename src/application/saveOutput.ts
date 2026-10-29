/**
 * Copying a finished file out of the app cache.
 *
 * Both outputs of the app travel this way: a converted video or audio file, and
 * an extracted subtitle file. The work is already complete when this runs, so
 * nothing here can lose it: a refused copy is reported and the screen offers it
 * again. Ports keep MediaLibrary and the system folder picker out of this file,
 * which is what makes both destinations testable in Node (TR-24).
 */

import { describeSaveFailure, describeTextSaveUnsupported, type Failure } from '../domain/errors';
import { mimeTypeCandidates } from '../domain/mimeTypes';
import { canSaveTo, type SaveAction, type SaveFileKind, type SaveTarget } from '../domain/saveIntent';

export interface SaveRequest {
  /** Media can go to Photos or a folder; a subtitle file only to a folder. */
  readonly kind: SaveFileKind;
  readonly target: SaveTarget;
  /** Absolute path of the converted file inside the job directory. */
  readonly path: string;
  /** Display name of the converted file, extension included. */
  readonly name: string;
}

/** Result of opening Android's folder picker. */
export type FolderPickOutcome =
  | { readonly status: 'picked'; readonly uri: string; readonly label: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: unknown };

export interface CopyToFolderRequest {
  readonly kind: SaveFileKind;
  readonly path: string;
  readonly name: string;
  /** SAF tree URI the user granted in this session. */
  readonly folderUri: string;
  /** Human name of that folder, e.g. `Download`. */
  readonly folderLabel: string;
  /**
   * MIME types to write the document as, most specific first. A text file is
   * created by the adapter under one of these; a media file is copied as bytes
   * and the type is only advisory.
   */
  readonly mimeTypes: readonly string[];
}

export interface SavePorts {
  /** Adds the file to the device photo library. */
  saveToPhotos(path: string): Promise<{ readonly location: string }>;
  /** Opens the system picker; an app cannot choose a folder by itself. */
  pickFolder(): Promise<FolderPickOutcome>;
  /** Copies the file into a folder that came from `pickFolder`. */
  copyToFolder(request: CopyToFolderRequest): Promise<{ readonly location: string }>;
}

export type SaveOutcome =
  | { readonly status: 'saved'; readonly location: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly failure: Failure };

export interface SaveOptions {
  readonly request: SaveRequest;
  readonly ports: SavePorts;
  readonly dispatch: (action: SaveAction) => void;
}

/**
 * Copies one finished file to one destination.
 *
 * Reports through `dispatch` as it goes, so the screen shows the attempt even if
 * the user leaves it mid-flight, and returns the same outcome for the caller.
 */
export async function saveOutput({
  request,
  ports,
  dispatch,
}: SaveOptions): Promise<SaveOutcome> {
  dispatch({ type: 'save/started', target: request.target });

  // Photos has no collection for a text file, so the refusal is decided here —
  // before a port is asked to do something the platform cannot do.
  if (!canSaveTo(request.kind, request.target)) {
    const failure = describeTextSaveUnsupported();
    dispatch({ type: 'save/failed', failure });
    return { status: 'failed', failure };
  }

  try {
    const location =
      request.target === 'photos'
        ? (await ports.saveToPhotos(request.path)).location
        : await saveToPickedFolder(request, ports);

    if (location === null) {
      dispatch({ type: 'save/skipped' });
      return { status: 'cancelled' };
    }

    dispatch({ type: 'save/succeeded', location });
    return { status: 'saved', location };
  } catch (error) {
    const failure = describeSaveFailure(error, request.target);
    dispatch({ type: 'save/failed', failure });
    return { status: 'failed', failure };
  }
}

/** `null` means the user closed the picker, which is not a failure. */
async function saveToPickedFolder(
  request: SaveRequest,
  ports: SavePorts,
): Promise<string | null> {
  const pick = await ports.pickFolder();

  if (pick.status === 'cancelled') {
    return null;
  }
  if (pick.status === 'failed') {
    throw pick.error ?? new Error('The folder picker did not open.');
  }

  const { location } = await ports.copyToFolder({
    kind: request.kind,
    path: request.path,
    name: request.name,
    folderUri: pick.uri,
    folderLabel: pick.label,
    mimeTypes: mimeTypeCandidates(request.name),
  });
  return location;
}

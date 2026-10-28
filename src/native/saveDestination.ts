/**
 * Save adapter.
 *
 * The only module that talks to `expo-media-library` or opens Android's folder
 * picker, so the copy logic above it stays testable in Node (TR-24). Nothing
 * here deletes the converted file: the app cache keeps it until the job is
 * cleared, whatever the platform does with the copy.
 */

import { Directory, File } from 'expo-file-system';
import { Asset } from 'expo-media-library';

import type {
  CopyToFolderRequest,
  FolderPickOutcome,
  SavePorts,
} from '../application/saveOutput';
import { resolveCollision, toFileUri } from '../domain/naming';

/**
 * `content://…/tree/primary%3ADownload` → `Download`.
 *
 * SAF tree URIs end in `<volume>:<relative path>`; the last segment is what the
 * user recognises as the folder name.
 */
export function folderLabel(treeUri: string): string {
  const segments = treeUri.split('/').filter((segment) => segment.length > 0);
  const last = decodeURIComponent(segments[segments.length - 1] ?? '');
  const name = last.includes(':') ? last.slice(last.lastIndexOf(':') + 1) : last;
  const trimmed = name.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : 'the folder';
}

/** The picker reports a cancel as an exception, not as an empty result. */
function isPickerCancelled(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return `${code} ${message}`.toLowerCase().includes('cancel');
}

function labelForLibrary(file: File): string {
  // MediaStore files video under Photos and audio under Music.
  return file.type.startsWith('audio/') ? 'Music' : 'Photos';
}

/**
 * Copies `source` into a folder the user picked, under a name nothing in that
 * folder already uses.
 *
 * `File.copy` names the new document after the source, so a clash has to be
 * resolved through a staging copy in the job directory: the folder receives the
 * free name and the file the user already had is never overwritten.
 */
async function copyIntoFolder(
  source: File,
  folder: Directory,
  targetName: string,
): Promise<void> {
  if (source.name === targetName) {
    await source.copy(folder, { overwrite: false });
    return;
  }

  const staging = new File(source.parentDirectory, targetName);
  try {
    await source.copy(staging, { overwrite: true });
    await staging.copy(folder, { overwrite: false });
  } finally {
    if (staging.exists) {
      staging.delete();
    }
  }
}

export const savePorts: SavePorts = {
  async saveToPhotos(path) {
    const file = new File(path);
    // MediaStore reads the type, and so the destination album, from this URI.
    await Asset.create(toFileUri(path));
    return { location: labelForLibrary(file) };
  },

  async pickFolder(): Promise<FolderPickOutcome> {
    try {
      const directory = await Directory.pickDirectoryAsync();
      return { status: 'picked', uri: directory.uri, label: folderLabel(directory.uri) };
    } catch (error) {
      return isPickerCancelled(error) ? { status: 'cancelled' } : { status: 'failed', error };
    }
  },

  async copyToFolder({ path, name, folderUri, folderLabel: label }: CopyToFolderRequest) {
    const folder = new Directory(folderUri);
    const source = new File(path);
    const taken = folder.list().map((entry) => entry.name);
    const targetName = resolveCollision(name, taken);

    await copyIntoFolder(source, folder, targetName);
    return { location: `${label}/${targetName}` };
  },
};

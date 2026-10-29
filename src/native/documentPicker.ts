/**
 * Source intake adapter.
 *
 * `expo-document-picker` opens the system document UI and lets the platform copy
 * the chosen files into the app cache; this module only relays the result. It
 * copies nothing, so there is no progress and no cancel during the copy — the UI
 * says so instead of faking both (D1, TR-05).
 *
 * Selection is multi-file: the system picker lets the user tick several videos in
 * one go, which is the whole point of the queue. Each asset arrives as its own
 * cached copy, so a batch costs as much cache as the files themselves.
 */

import * as DocumentPicker from 'expo-document-picker';

import type { SourceFile } from '../domain/mediaFiles';

export type PickOutcome =
  | { readonly status: 'picked'; readonly sources: readonly SourceFile[] }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: unknown };

/** Video and audio, so an audio source can still be probed and refused clearly. */
const ACCEPTED_TYPES = ['video/*', 'audio/*'];

function toSource(asset: DocumentPicker.DocumentPickerAsset): SourceFile {
  return {
    path: asset.uri,
    name: asset.name ?? 'selection',
    sizeBytes: typeof asset.size === 'number' ? asset.size : null,
    mimeType: asset.mimeType ?? null,
  };
}

export async function pickSourceFiles(): Promise<PickOutcome> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED_TYPES,
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (result.canceled) {
      return { status: 'cancelled' };
    }

    const assets = (result.assets ?? []).filter((asset) => typeof asset?.uri === 'string');
    if (assets.length === 0) {
      return { status: 'failed', error: new Error('The picker returned no file.') };
    }

    return { status: 'picked', sources: assets.map(toSource) };
  } catch (error) {
    return { status: 'failed', error };
  }
}

/**
 * Source intake adapter.
 *
 * `expo-document-picker` opens the system document UI and lets the platform copy
 * the chosen file into the app cache; this module only relays the result. It
 * copies nothing, so there is no progress and no cancel during the copy — the UI
 * says so instead of faking both (D1, TR-05).
 */

import * as DocumentPicker from 'expo-document-picker';

import type { SourceFile } from '../application/convertJob';

export type PickOutcome =
  | { readonly status: 'picked'; readonly source: SourceFile }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: unknown };

/** Video and audio, so an audio source can still be probed and refused clearly. */
const ACCEPTED_TYPES = ['video/*', 'audio/*'];

export async function pickSourceFile(): Promise<PickOutcome> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) {
      return { status: 'cancelled' };
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      return { status: 'failed', error: new Error('The picker returned no file.') };
    }

    const source: SourceFile = {
      path: asset.uri,
      name: asset.name ?? 'selection',
      sizeBytes: typeof asset.size === 'number' ? asset.size : null,
      mimeType: asset.mimeType ?? null,
    };

    return { status: 'picked', source };
  } catch (error) {
    return { status: 'failed', error };
  }
}

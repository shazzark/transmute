/**
 * Sidecar subtitle intake adapter.
 *
 * The picker is opened for any file on purpose. Android reports `.srt` under at
 * least three MIME types (`application/x-subrip`, `text/plain`, and sometimes
 * `application/octet-stream`), so a MIME filter would hide valid files on some
 * devices and let wrong ones through on others. The extension and the text are
 * checked in the domain layer instead, where the refusal is explainable (D3).
 */

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import type { SidecarPickOutcome, SidecarPorts } from '../application/sidecar';

/**
 * Cached copies are made by the platform, so the engine and the validator read
 * the same file even if the provider's original goes away.
 */
export async function pickSidecarFile(): Promise<SidecarPickOutcome> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
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

    // No extension fallback: `subtitle` fails the name check with a message that
    // names the file, instead of pretending an unnamed file is SubRip.
    return { status: 'picked', file: { path: asset.uri, name: asset.name ?? 'subtitle' } };
  } catch (error) {
    return { status: 'failed', error };
  }
}

export const sidecarPorts: SidecarPorts = {
  pickSidecarFile,

  async readTextFile(path: string): Promise<string> {
    return new File(path).text();
  },
};

/**
 * MIME types for the files the app writes.
 *
 * Android names a document's type from the MIME it is handed, not from the
 * extension, so a subtitle stored as `application/octet-stream` is an unknown
 * blob no text editor will open. Each entry lists the type the app prefers
 * first and any fallback a stricter provider may need — SubRip has no
 * registered type, and a folder that refuses `application/x-subrip` still
 * accepts `text/plain`.
 *
 * Derived from the file name because the name is what reaches the folder, and
 * the extension is the only part of it the platform reads (TR-16). Pure, so
 * every mapping is testable in Node (TR-21).
 */

/** The type every provider understands for a plain-text file. */
export const TEXT_PLAIN = 'text/plain';

/** What an extension the app does not recognise is handed over as. */
export const UNKNOWN_MIME_TYPE = 'application/octet-stream';

/**
 * Extensions the app writes, lower case, without the dot.
 *
 * The media entries mirror the preset extensions and the subtitle entries mirror
 * `SUBTITLE_EXTENSIONS`; `mimeTypes.test.ts` fails if a preset or subtitle format
 * is ever added without a type here.
 */
const BY_EXTENSION: Record<string, readonly string[]> = {
  mp4: ['video/mp4'],
  m4v: ['video/mp4'],
  mov: ['video/quicktime'],
  mkv: ['video/x-matroska'],
  webm: ['video/webm'],
  m4a: ['audio/mp4'],
  mp3: ['audio/mpeg'],
  wav: ['audio/wav'],
  flac: ['audio/flac'],
  ogg: ['audio/ogg'],
  opus: ['audio/opus'],
  // SubRip is the de facto type; WebVTT has a real one but plenty of providers
  // still only index text under `text/plain`.
  srt: ['application/x-subrip', TEXT_PLAIN],
  vtt: ['text/vtt', TEXT_PLAIN],
  txt: [TEXT_PLAIN],
};

/** The lower-case extension of a file name, or an empty string for none. */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/**
 * Every MIME type worth trying for `fileName`, most specific first.
 *
 * More than one entry means the first may be refused by the folder the user
 * picked, so the copy is retried with the next one rather than failing.
 */
export function mimeTypeCandidates(fileName: string): readonly string[] {
  return BY_EXTENSION[extensionOf(fileName)] ?? [UNKNOWN_MIME_TYPE];
}

/** The type to state for `fileName` when only one can be named. */
export function mimeTypeFor(fileName: string): string {
  return mimeTypeCandidates(fileName)[0] ?? UNKNOWN_MIME_TYPE;
}

/** True when the file is text, which a media library cannot index. */
export function isTextMimeType(mimeType: string): boolean {
  return mimeType === TEXT_PLAIN || mimeType === 'application/x-subrip' || mimeType === 'text/vtt';
}

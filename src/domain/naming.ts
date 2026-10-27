/**
 * Output naming.
 *
 * The source name is a template, never a path: separators, traversal, control
 * characters, and reserved characters are removed before a name reaches the
 * filesystem or a native command line (TR-16).
 */

/** Android and Windows both dislike these in a file name. */
const RESERVED = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

/** Leaves room for ` (99)` and a five-character extension inside 255 bytes. */
const MAX_BASE_BYTES = 200;

export const FALLBACK_BASE_NAME = 'converted';

function isControlCharacter(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

/** UTF-8 byte length, counted by code point so surrogate pairs stay whole. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

function truncateToBytes(value: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const size = utf8ByteLength(character);
    if (bytes + size > maxBytes) {
      break;
    }
    result += character;
    bytes += size;
  }
  return result;
}

/** Drops the last extension, if any: `Trip 2026.MOV` → `Trip 2026`. */
export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) {
    return fileName;
  }
  return fileName.slice(0, dot);
}

/** The last path segment, whichever separator the provider used. */
export function baseNameOf(fileName: string): string {
  const segments = fileName.split(/[\\/]/);
  return segments[segments.length - 1] ?? '';
}

/**
 * Turns untrusted text into a safe base name (no extension).
 *
 * `../../etc/passwd` → `passwd`; `a;b?.mp4` → `a_b_`; an all-separator name
 * becomes `converted` rather than an empty string.
 */
export function sanitizeBaseName(rawName: string): string {
  const base = stripExtension(baseNameOf(rawName));

  let cleaned = '';
  for (const character of base) {
    const code = character.codePointAt(0) ?? 0;
    if (isControlCharacter(code) || RESERVED.has(character)) {
      cleaned += '_';
    } else {
      cleaned += character;
    }
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // Trailing dots and spaces are legal in some filesystems and confusing in all.
  cleaned = cleaned.replace(/^[. ]+|[. ]+$/g, '');
  cleaned = truncateToBytes(cleaned, MAX_BASE_BYTES).replace(/[. ]+$/g, '');

  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return FALLBACK_BASE_NAME;
  }
  return cleaned;
}

/** `Trip 2026.MOV` + `.mp4` → `Trip 2026.mp4`; the preset owns the extension. */
export function buildOutputName(sourceName: string, extension: string): string {
  return `${sanitizeBaseName(sourceName)}${extension}`;
}

/**
 * Resolves a name clash with ` (2)`, ` (3)`, … before the extension
 * (TR-16). `existing` is the list of names already in the job directory.
 */
export function resolveCollision(outputName: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  if (!taken.has(outputName.toLowerCase())) {
    return outputName;
  }

  const dot = outputName.lastIndexOf('.');
  const base = dot > 0 ? outputName.slice(0, dot) : outputName;
  const extension = dot > 0 ? outputName.slice(dot) : '';

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base} (${suffix})${extension}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // A thousand copies of the same name: fall back to a timestamp instead of looping.
  return `${base} ${Date.now()}${extension}`;
}

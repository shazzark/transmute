/**
 * Display helpers for the screen. Pure, so they are unit-tested in Node.
 */

/** Bytes as `12.3 MB`, using decimal units like Android's own storage screens. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  if (bytes < 1000) {
    return `${Math.round(bytes)} B`;
  }

  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const decimals = value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

/** Joins the parts of a metadata line, skipping anything unknown. */
export function metadataLine(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' · ');
}

/**
 * The source container as the user knows it, taken from the file name:
 * `Trip 2026.MOV` → `MOV`. Returns null when the name has no usable extension,
 * so the caller can fall back to the probed container.
 */
export function extensionLabel(fileName: string | null | undefined): string | null {
  if (typeof fileName !== 'string') {
    return null;
  }
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) {
    return null;
  }
  const extension = base.slice(dot + 1);
  // Real extensions are short and alphanumeric; anything else is noise.
  if (extension.length > 5 || !/^[a-z0-9]+$/i.test(extension)) {
    return null;
  }
  return extension.toUpperCase();
}

/**
 * FFprobe reports `mov,mp4,m4a,3gp,3g2,mj2` for one container family. The first
 * name is the primary one, so the UI shows `MOV` rather than the whole list.
 */
export function containerLabel(formatName: string | null | undefined): string | null {
  if (typeof formatName !== 'string') {
    return null;
  }
  const first = formatName.split(',')[0]?.trim() ?? '';
  return first.length > 0 ? first.toUpperCase() : null;
}

/** `1080×1920`, or null while either side is unknown. */
export function resolutionLabel(
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  if (typeof width !== 'number' || typeof height !== 'number') {
    return null;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return `${Math.round(width)}×${Math.round(height)}`;
}

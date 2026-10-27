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

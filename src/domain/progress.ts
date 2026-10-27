/**
 * Progress maths.
 *
 * Progress comes from the engine's own statistics: how much output time has been
 * processed against how long the source is. It never decreases inside a job and
 * never leaves 0–100, because a bar that jumps backwards reads as a bug (TR-04).
 */

export interface ProgressSample {
  /** Whole percent, 0–100, or `null` when the duration is unknown. */
  readonly percent: number | null;
  readonly processedMs: number;
  /** True when the source duration is unknown, so the UI shows a spinner. */
  readonly indeterminate: boolean;
}

/** Guards against `NaN`, `Infinity`, and negatives reaching the UI. */
function finiteOrNull(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

/**
 * Converts one statistics callback into the bar's value.
 *
 * @param previousPercent the value already shown, so the result cannot go down
 * @param processedMs the `timeMs` the engine reported
 * @param durationMs the source duration; `undefined` when FFprobe did not say
 */
export function progressFromStatistics(
  previousPercent: number,
  processedMs: number,
  durationMs: number | undefined,
): ProgressSample {
  const safeProcessed = finiteOrNull(processedMs) ?? 0;
  const safePrevious = Math.min(100, Math.max(0, finiteOrNull(previousPercent) ?? 0));
  const safeDuration = finiteOrNull(durationMs);

  if (safeDuration === null || safeDuration === 0) {
    return { percent: null, processedMs: safeProcessed, indeterminate: true };
  }

  const raw = Math.floor((safeProcessed / safeDuration) * 100);
  const clamped = Math.min(100, Math.max(0, raw));
  return {
    percent: Math.max(safePrevious, clamped),
    processedMs: safeProcessed,
    indeterminate: false,
  };
}

/** Elapsed time as `m:ss`, or `h:mm:ss` past an hour. */
export function formatElapsed(milliseconds: number): string {
  const safe = Math.max(0, Math.floor(finiteOrNull(milliseconds) ?? 0));
  const totalSeconds = Math.floor(safe / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

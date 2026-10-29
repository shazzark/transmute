/**
 * What the ongoing notification says.
 *
 * The notification is read from the lock screen, often with one line visible, so
 * the words are built here — pure, tested, and never assembled in the component
 * or in Kotlin. The bar shows the batch's overall progress: with several files
 * queued, a bar that resets to 0% for every file looks like a failure, and a
 * number that matches the app is the whole point of the notification (TR-10).
 */

export interface NotificationContent {
  /** One line: what is happening and how far through the batch it is. */
  readonly title: string;
  /** The file being worked on, with its own percentage when the duration is known. */
  readonly text: string;
  /** Overall batch progress, 0–100 — always known, so the bar is never a spinner. */
  readonly percent: number;
}

export interface RunningFacts {
  /** 1-based position of the running file in the batch. */
  readonly position: number;
  readonly total: number;
  readonly name: string;
  /** The running file's own percent, or `null` while its duration is unknown. */
  readonly percent: number | null;
  /** Whole-batch percent, so the bar does not jump backwards between files. */
  readonly overallPercent: number;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** A file name long enough to be truncated stops being an identifier. */
const MAX_NAME_LENGTH = 48;

function displayName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'this file';
  }
  return trimmed.length > MAX_NAME_LENGTH ? `${trimmed.slice(0, MAX_NAME_LENGTH - 1)}…` : trimmed;
}

/** `Converting 2 of 3`, with the position clamped to something a human can read. */
export function notificationTitle(position: number, total: number): string {
  const count = Math.max(1, Math.round(total));
  const place = Math.min(count, Math.max(1, Math.round(position)));
  return `Converting ${place} of ${count}`;
}

/** `MyVideo.mp4 — 45%`, or `MyVideo.mp4 — working…` when the length is unknown. */
export function notificationText(name: string, percent: number | null): string {
  const shown = displayName(name);
  return percent === null ? `${shown} — working…` : `${shown} — ${clampPercent(percent)}%`;
}

export function runningNotification(facts: RunningFacts): NotificationContent {
  return {
    title: notificationTitle(facts.position, facts.total),
    text: notificationText(facts.name, facts.percent),
    // The bar follows the batch, not the file: it only moves forwards.
    percent: clampPercent(facts.overallPercent),
  };
}

export interface OutcomeFacts {
  readonly total: number;
  readonly converted: number;
  readonly failed: number;
  readonly cancelled: number;
}

/**
 * One sentence about a finished batch, for the screen and for a TalkBack
 * announcement. Written so no count is ever silently dropped: a cancelled row is
 * named, not folded into "done".
 */
export function describeOutcome(facts: OutcomeFacts): string {
  const total = Math.max(0, Math.round(facts.total));
  if (total === 0) {
    return 'Nothing to convert.';
  }

  const parts: string[] = [];
  if (facts.converted > 0) {
    parts.push(`${facts.converted} converted`);
  }
  if (facts.failed > 0) {
    parts.push(`${facts.failed} failed`);
  }
  if (facts.cancelled > 0) {
    parts.push(`${facts.cancelled} cancelled`);
  }

  const done = facts.converted + facts.failed + facts.cancelled;
  if (done < total) {
    parts.push(`${total - done} waiting`);
  }

  return `${parts.join(', ')} of ${total}.`;
}

/**
 * Keeps the ongoing notification in step with the queue.
 *
 * Two rules make this worth its own tested module rather than a line in the
 * screen. First, the notification is a courtesy: a refused permission, a refused
 * service start, or a rejected call must never fail a conversion (TR-30).
 * Second, statistics arrive twice a second, so identical content must not cross
 * the bridge again — the words change far less often than the percentage inside
 * a truncated title (TR-24).
 */

import type { NotificationContent } from '../domain/jobNotification';
import { runningNotification } from '../domain/jobNotification';
import { activeJob, positionOf, queuePercent, type QueueState } from '../domain/queue';

/** The narrow port the notification path needs; the adapter lives in `src/native`. */
export interface ForegroundPorts {
  /** Asks for the Android 13+ notification permission; resolves whether it is granted. */
  requestPermission(): Promise<boolean>;
  /** Starts or refreshes the foreground service and its notification. */
  show(content: NotificationContent): Promise<boolean>;
  /** Takes the notification down and stops the service. */
  hide(): Promise<void>;
  /** Subscribes to the notification's Cancel action; resolves to the unsubscribe. */
  onCancel(listener: () => void): () => void;
  /** Subscribes to Android stopping a timed-out dataSync service. */
  onTimeout(listener: () => void): () => void;
}

export interface NotificationPublisher {
  /** Asks once, before the batch starts. Never throws. */
  prepare(): Promise<boolean>;
  /** Shows the content unless it is word-for-word the last thing shown. Never throws. */
  publish(content: NotificationContent): Promise<boolean>;
  /** Removes the notification. Never throws. */
  clear(): Promise<void>;
}

function keyOf(content: NotificationContent): string {
  return `${content.title}\u0000${content.text}\u0000${content.percent}`;
}

/**
 * What the notification should say for a queue, or `null` when nothing is running.
 *
 * This is the one bridge between the queue's state and the notification's words:
 * both halves are tested separately, and this function is the only place that
 * knows the two shapes meet.
 */
export function notificationForQueue(state: QueueState): NotificationContent | null {
  const job = activeJob(state);
  if (job === null) {
    return null;
  }
  return runningNotification({
    position: positionOf(state, job.id),
    total: state.jobs.length,
    name: job.source.name,
    percent: job.indeterminate ? null : job.progress,
    overallPercent: queuePercent(state),
  });
}

export function createNotificationPublisher(ports: ForegroundPorts): NotificationPublisher {
  let lastKey: string | null = null;

  return {
    async prepare(): Promise<boolean> {
      try {
        return await ports.requestPermission();
      } catch {
        return false;
      }
    },

    async publish(content: NotificationContent): Promise<boolean> {
      const key = keyOf(content);
      if (key === lastKey) {
        return true;
      }
      // Claimed before the call: a rejected bridge call must not make every later
      // tick retry the same words.
      lastKey = key;
      try {
        return await ports.show(content);
      } catch {
        return false;
      }
    },

    async clear(): Promise<void> {
      lastKey = null;
      try {
        await ports.hide();
      } catch {
        // The service may already be gone; there is nothing to report.
      }
    },
  };
}

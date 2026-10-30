let pendingCount = 0;
const listeners = new Set<() => void>();

/** Publishes the live queued + running count for the tab badge. */
export function updateQueueBadge(count: number): void {
  if (pendingCount === count) return;
  pendingCount = count;
  listeners.forEach((listener) => listener());
}

export function subscribeQueueBadge(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getQueueBadge(): number { return pendingCount; }

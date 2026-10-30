import { afterEach, describe, expect, it, vi } from 'vitest';

import { getQueueBadge, subscribeQueueBadge, updateQueueBadge } from './queueBadge';

afterEach(() => updateQueueBadge(0));

describe('live queue badge', () => {
  it('publishes pending work to the tab and keeps it while routes change', () => {
    const changed = vi.fn();
    const unsubscribe = subscribeQueueBadge(changed);
    updateQueueBadge(2);
    expect(getQueueBadge()).toBe(2);
    expect(changed).toHaveBeenCalledTimes(1);
    // A navigation change does not reset the controller-owned queue count.
    expect(getQueueBadge()).toBe(2);
    unsubscribe();
    updateQueueBadge(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

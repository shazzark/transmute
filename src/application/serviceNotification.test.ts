import { describe, expect, it, vi } from 'vitest';

import type { NotificationContent } from '../domain/jobNotification';
import {
  createNotificationPublisher,
  type ForegroundPorts,
  type NotificationPublisher,
} from './serviceNotification';

const CONTENT: NotificationContent = {
  title: 'Converting 1 of 3',
  text: 'MyVideo.mp4 — 45%',
  percent: 15,
};

function fakePorts(overrides: Partial<ForegroundPorts> = {}): {
  ports: ForegroundPorts;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
} {
  const show = vi.fn(async () => true);
  const hide = vi.fn(async () => {});
  const requestPermission = vi.fn(async () => true);

  const ports: ForegroundPorts = {
    requestPermission,
    show,
    hide,
    onCancel: () => () => {},
    ...overrides,
  };

  return { ports, show, hide, requestPermission };
}

function publisherWith(overrides: Partial<ForegroundPorts> = {}): {
  publisher: NotificationPublisher;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
} {
  const { ports, show, hide } = fakePorts(overrides);
  return { publisher: createNotificationPublisher(ports), show, hide };
}

describe('createNotificationPublisher', () => {
  it('shows the notification the first time it is asked', async () => {
    const { publisher, show } = publisherWith();

    await expect(publisher.publish(CONTENT)).resolves.toBe(true);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(CONTENT);
  });

  it('does not cross the bridge again for content that did not change', async () => {
    const { publisher, show } = publisherWith();

    await publisher.publish(CONTENT);
    await publisher.publish({ ...CONTENT });
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('shows again as soon as any word or the number changes', async () => {
    const { publisher, show } = publisherWith();

    await publisher.publish(CONTENT);
    await publisher.publish({ ...CONTENT, percent: 16 });
    await publisher.publish({ ...CONTENT, percent: 16, text: 'MyVideo.mp4 — 46%' });
    await publisher.publish({ ...CONTENT, percent: 16, text: 'MyVideo.mp4 — 46%', title: 'Converting 2 of 3' });

    expect(show).toHaveBeenCalledTimes(4);
  });

  it('treats a refused service start as "no notification", not as a failure', async () => {
    const { publisher } = publisherWith({ show: async () => false });

    await expect(publisher.publish(CONTENT)).resolves.toBe(false);
  });

  it('survives a bridge call that throws', async () => {
    const { publisher } = publisherWith({
      show: async () => {
        throw new Error('ForegroundServiceStartNotAllowedException');
      },
    });

    await expect(publisher.publish(CONTENT)).resolves.toBe(false);
  });

  it('does not retry the same words after the call threw', async () => {
    const show = vi.fn(async () => {
      throw new Error('no service');
    });
    const publisher = createNotificationPublisher({
      requestPermission: async () => true,
      show,
      hide: async () => {},
      onCancel: () => () => {},
    });

    await publisher.publish(CONTENT);
    await publisher.publish(CONTENT);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('clears the notification and forgets what was shown', async () => {
    const { publisher, show, hide } = publisherWith();

    await publisher.publish(CONTENT);
    await publisher.clear();
    expect(hide).toHaveBeenCalledTimes(1);

    await publisher.publish(CONTENT);
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('does not throw when taking the notification down fails', async () => {
    const { publisher } = publisherWith({
      hide: async () => {
        throw new Error('already gone');
      },
    });

    await expect(publisher.clear()).resolves.toBeUndefined();
  });

  it('reports the permission answer, and false when asking throws', async () => {
    const granted = publisherWith();
    await expect(granted.publisher.prepare()).resolves.toBe(true);

    const refused = publisherWith({ requestPermission: async () => false });
    await expect(refused.publisher.prepare()).resolves.toBe(false);

    const broken = publisherWith({
      requestPermission: async () => {
        throw new Error('no activity');
      },
    });
    await expect(broken.publisher.prepare()).resolves.toBe(false);
  });

  it('publishes content even when notifications were refused', async () => {
    // A denied POST_NOTIFICATIONS hides the notification; the foreground service
    // still has to run or Android may kill the conversion.
    const { publisher, show } = publisherWith({ requestPermission: async () => false });

    await expect(publisher.prepare()).resolves.toBe(false);
    await expect(publisher.publish(CONTENT)).resolves.toBe(true);
    expect(show).toHaveBeenCalledTimes(1);
  });
});

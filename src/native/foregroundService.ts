/**
 * Foreground-service adapter: the only file that names the Kotlin module.
 *
 * The module ships as a local Expo module (`modules/transmute-background`), so a
 * build that predates it — or Expo Go — simply has no such module. In that case
 * every call resolves to "not available" instead of throwing: a missing
 * notification is a smaller failure than a conversion that cannot start (TR-29).
 */

import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

import type { ForegroundPorts } from '../application/serviceNotification';
import type { NotificationContent } from '../domain/jobNotification';

/** The shape the Kotlin module exposes; keep in step with `TransmuteBackgroundModule`. */
interface BackgroundNativeModule {
  notificationsEnabled(): boolean;
  requestNotificationPermission(): Promise<boolean>;
  show(options: {
    readonly title: string;
    readonly text: string;
    readonly percent: number;
  }): Promise<boolean>;
  hide(): Promise<void>;
  addListener(event: 'onCancel', listener: () => void): EventSubscription;
}

const MODULE_NAME = 'TransmuteBackground';

let loaded: BackgroundNativeModule | null = null;
let attempted = false;

function nativeModule(): BackgroundNativeModule | null {
  if (!attempted) {
    attempted = true;
    try {
      loaded = requireNativeModule<BackgroundNativeModule>(MODULE_NAME);
    } catch {
      // No module in this binary: the app still converts, just without a
      // notification that survives backgrounding.
      loaded = null;
    }
  }
  return loaded;
}

/** Whether this build can keep a conversion alive in the background at all. */
export function isBackgroundServiceAvailable(): boolean {
  return nativeModule() !== null;
}

export const foregroundPorts: ForegroundPorts = {
  async requestPermission(): Promise<boolean> {
    const module = nativeModule();
    if (module === null) {
      return false;
    }
    return module.requestNotificationPermission();
  },

  async show(content: NotificationContent): Promise<boolean> {
    const module = nativeModule();
    if (module === null) {
      return false;
    }
    return module.show({ title: content.title, text: content.text, percent: content.percent });
  },

  async hide(): Promise<void> {
    const module = nativeModule();
    if (module !== null) {
      await module.hide();
    }
  },

  onCancel(listener: () => void): () => void {
    const module = nativeModule();
    if (module === null) {
      return () => {};
    }
    const subscription = module.addListener('onCancel', listener);
    return () => subscription.remove();
  },
};

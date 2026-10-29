import { nativeIntentDestination } from '../src/application/notificationDestination';

/** Restrict external deep links to the destination used by completion notifications. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return nativeIntentDestination(path);
}

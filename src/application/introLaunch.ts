import { notificationDestination } from './notificationDestination';

/** Only a normal Home cold launch gets the animated introduction. */
export function shouldPlayOpeningIntro(path: string, notificationData: unknown): boolean {
  return (path === '/' || path === '/index') && notificationDestination(notificationData) === null;
}

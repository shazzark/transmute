/** Only the results screen is a valid destination from a completion notification. */
export function notificationDestination(data: unknown): '/results' | null {
  if (typeof data !== 'object' || data === null || !('url' in data)) {
    return null;
  }
  return data.url === '/results' ? '/results' : null;
}

/** Maps the native service PendingIntent to one allowed route; all other links reset home. */
export function nativeIntentDestination(path: string): '/results' | '/' {
  return /^transmute:\/\/results\/?$/.test(path) || path === '/results' ? '/results' : '/';
}

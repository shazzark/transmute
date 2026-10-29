import { describe, expect, it } from 'vitest';

import { nativeIntentDestination, notificationDestination } from './notificationDestination';

describe('notificationDestination', () => {
  it('allows the completion route', () => {
    expect(notificationDestination({ url: '/results' })).toBe('/results');
  });

  it.each([null, undefined, {}, { url: '/' }, { url: 'https://example.test' }, '/results'])(
    'rejects destinations outside the allowlist: %j',
    (data) => expect(notificationDestination(data)).toBeNull(),
  );
});

describe('nativeIntentDestination', () => {
  it('maps the foreground service PendingIntent to results', () => {
    expect(nativeIntentDestination('transmute://results')).toBe('/results');
  });

  it.each(['transmute://settings', 'https://example.test/results', 'transmute://results/1'])(
    'rejects an unexpected external destination: %s',
    (path) => expect(nativeIntentDestination(path)).toBe('/'),
  );
});

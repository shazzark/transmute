import { describe, expect, it } from 'vitest';

import { shouldPlayOpeningIntro } from './introLaunch';

describe('opening introduction launch routing', () => {
  it('plays on a normal Home launch', () => {
    expect(shouldPlayOpeningIntro('/', null)).toBe(true);
  });

  it('skips a notification destination and non-Home route', () => {
    expect(shouldPlayOpeningIntro('/', { url: '/results' })).toBe(false);
    expect(shouldPlayOpeningIntro('/results', null)).toBe(false);
  });
});

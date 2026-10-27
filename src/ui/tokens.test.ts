import { describe, expect, it } from 'vitest';

import { contrastRatio, parseHex, relativeLuminance } from '../domain/colour';
import { color } from './tokens';

describe('parseHex', () => {
  it('reads six-digit and three-digit colours', () => {
    expect(parseHex('#0E1116')).toEqual({ r: 14, g: 17, b: 22 });
    expect(parseHex('fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects anything else', () => {
    expect(() => parseHex('#12345')).toThrow(/#RRGGBB/);
    expect(() => parseHex('rebeccapurple')).toThrow(/#RRGGBB/);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour against itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('luminance ordering matches intuition', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 3);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 3);
  });
});

/**
 * The pairs documented in `architecture.md`. These assertions are the guard
 * against a palette edit that quietly drops text below AA (TR-20).
 */
describe('design token contrast', () => {
  const pairs: ReadonlyArray<[label: string, foreground: string, background: string, minimum: number]> =
    [
      ['text.primary on bg', color.textPrimary, color.bg, 7],
      ['text.secondary on bg', color.textSecondary, color.bg, 4.5],
      ['accent on surface', color.accent, color.surface, 4.5],
      ['accent.ink on accent', color.accentInk, color.accent, 4.5],
      ['danger on bg', color.danger, color.bg, 4.5],
      ['warning on bg', color.warning, color.bg, 4.5],
      ['success on bg', color.success, color.bg, 4.5],
    ];

  it.each(pairs)('%s meets its minimum ratio', (_label, foreground, background, minimum) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(minimum);
  });

  it('documents why primary buttons use dark ink rather than white text', () => {
    expect(contrastRatio('#FFFFFF', color.accent)).toBeLessThan(4.5);
  });
});

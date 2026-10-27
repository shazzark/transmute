import { describe, expect, it } from 'vitest';

import {
  baseNameOf,
  buildOutputName,
  resolveCollision,
  sanitizeBaseName,
  stripExtension,
  utf8ByteLength,
} from './naming';

describe('sanitizeBaseName', () => {
  it.each([
    ['Trip 2026.MOV', 'Trip 2026'],
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\windows\\system32\\evil.mp4', 'evil'],
    ['a;b?.mp4', 'a;b_'],
    ['what: about <this>|.mp4', 'what_ about _this__'],
    ['  padded  name  .mp4', 'padded name'],
    ['...hidden....mp4', 'hidden'],
    ['tab\tname.mp4', 'tab_name'],
  ])('sanitises %j to %j', (input, expected) => {
    expect(sanitizeBaseName(input)).toBe(expected);
  });

  it('replaces control characters', () => {
    expect(sanitizeBaseName('bad\u0000name\u001f.mp4')).toBe('bad_name_');
    expect(sanitizeBaseName('del\u007fete.mp4')).toBe('del_ete');
  });

  it('falls back to a name when everything was stripped', () => {
    expect(sanitizeBaseName('/')).toBe('converted');
    expect(sanitizeBaseName('...')).toBe('converted');
    expect(sanitizeBaseName('   ')).toBe('converted');
    expect(sanitizeBaseName('')).toBe('converted');
  });

  it('keeps emoji whole and within the byte budget', () => {
    const emoji = '🎬'.repeat(80);
    const cleaned = sanitizeBaseName(`${emoji}.mp4`);

    expect(cleaned.startsWith('🎬')).toBe(true);
    expect(utf8ByteLength(cleaned)).toBeLessThanOrEqual(200);
    // No broken surrogate half survives truncation.
    expect(cleaned).toBe(Array.from(cleaned).join(''));
  });

  it('caps long ASCII names at 200 bytes', () => {
    const cleaned = sanitizeBaseName(`${'a'.repeat(400)}.mp4`);

    expect(cleaned).toHaveLength(200);
  });
});

describe('buildOutputName', () => {
  it('forces the preset extension over the source one', () => {
    expect(buildOutputName('Trip 2026.MOV', '.mp4')).toBe('Trip 2026.mp4');
    expect(buildOutputName('song.wav', '.mp3')).toBe('song.mp3');
    expect(buildOutputName('clip', '.mp4')).toBe('clip.mp4');
  });

  it('never returns a path', () => {
    expect(buildOutputName('/storage/emulated/0/Movies/a.mp4', '.mp4')).toBe('a.mp4');
  });
});

describe('resolveCollision', () => {
  it('keeps a free name untouched', () => {
    expect(resolveCollision('a.mp4', [])).toBe('a.mp4');
    expect(resolveCollision('a.mp4', ['b.mp4'])).toBe('a.mp4');
  });

  it('numbers the second and third copies before the extension', () => {
    expect(resolveCollision('a.mp4', ['a.mp4'])).toBe('a (2).mp4');
    expect(resolveCollision('a.mp4', ['a.mp4', 'a (2).mp4'])).toBe('a (3).mp4');
  });

  it('compares case-insensitively, as Android storage does', () => {
    expect(resolveCollision('A.MP4', ['a.mp4'])).toBe('A (2).MP4');
  });

  it('handles a name with no extension', () => {
    expect(resolveCollision('clip', ['clip'])).toBe('clip (2)');
  });
});

describe('path helpers', () => {
  it('takes the last segment for either separator', () => {
    expect(baseNameOf('/a/b/c.mp4')).toBe('c.mp4');
    expect(baseNameOf('C:\\a\\b\\c.mp4')).toBe('c.mp4');
    expect(baseNameOf('c.mp4')).toBe('c.mp4');
  });

  it('strips only a real extension', () => {
    expect(stripExtension('a.b.mp4')).toBe('a.b');
    expect(stripExtension('.hidden')).toBe('.hidden');
    expect(stripExtension('noext')).toBe('noext');
  });
});

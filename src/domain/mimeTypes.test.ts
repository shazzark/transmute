import { describe, expect, it } from 'vitest';

import { PRESETS } from './presets';
import {
  isTextMimeType,
  mimeTypeCandidates,
  mimeTypeFor,
  TEXT_PLAIN,
  UNKNOWN_MIME_TYPE,
} from './mimeTypes';
import { SUBTITLE_EXTENSIONS, subtitleOutputName, type SubtitleFormat } from './subtitles';

describe('mimeTypeFor', () => {
  it('names the media type of every format the app writes', () => {
    expect(mimeTypeFor('Trip 2026.mp4')).toBe('video/mp4');
    expect(mimeTypeFor('Trip 2026.mkv')).toBe('video/x-matroska');
    expect(mimeTypeFor('Trip 2026.mov')).toBe('video/quicktime');
    expect(mimeTypeFor('Trip 2026.webm')).toBe('video/webm');
    expect(mimeTypeFor('Track.mp3')).toBe('audio/mpeg');
    expect(mimeTypeFor('Track.m4a')).toBe('audio/mp4');
    expect(mimeTypeFor('Track.wav')).toBe('audio/wav');
    expect(mimeTypeFor('Track.flac')).toBe('audio/flac');
    expect(mimeTypeFor('Track.ogg')).toBe('audio/ogg');
    expect(mimeTypeFor('Track.opus')).toBe('audio/opus');
  });

  it('names a subtitle as a subtitle, never as media', () => {
    expect(mimeTypeFor('Trip 2026.srt')).toBe('application/x-subrip');
    expect(mimeTypeFor('Trip 2026.vtt')).toBe('text/vtt');
  });

  it('reads the extension regardless of case, spaces, or dots in the name', () => {
    expect(mimeTypeFor('Trip 2026.SRT')).toBe('application/x-subrip');
    expect(mimeTypeFor('a.b.c.vtt')).toBe('text/vtt');
    expect(mimeTypeFor('My Holiday  Video.MP4')).toBe('video/mp4');
  });

  it('falls back to a generic document for an extension it does not know', () => {
    expect(mimeTypeFor('notes.md')).toBe(UNKNOWN_MIME_TYPE);
    // A leading dot is a hidden file, not an extension, so nothing is claimed.
    expect(mimeTypeFor('.srt')).toBe(UNKNOWN_MIME_TYPE);
    expect(mimeTypeFor('no-extension')).toBe(UNKNOWN_MIME_TYPE);
  });
});

describe('mimeTypeCandidates', () => {
  it('offers one type when one type is enough', () => {
    expect(mimeTypeCandidates('Trip 2026.mp4')).toEqual(['video/mp4']);
    expect(mimeTypeCandidates('notes.md')).toEqual([UNKNOWN_MIME_TYPE]);
  });

  it('keeps text/plain as the fallback a stricter folder still accepts', () => {
    expect(mimeTypeCandidates('Trip 2026.srt')).toEqual(['application/x-subrip', TEXT_PLAIN]);
    expect(mimeTypeCandidates('Trip 2026.vtt')).toEqual(['text/vtt', TEXT_PLAIN]);
  });
});

describe('isTextMimeType', () => {
  it('separates the text types from the media ones', () => {
    expect(isTextMimeType('application/x-subrip')).toBe(true);
    expect(isTextMimeType('text/vtt')).toBe(true);
    expect(isTextMimeType(TEXT_PLAIN)).toBe(true);
    expect(isTextMimeType('video/mp4')).toBe(false);
    expect(isTextMimeType('audio/mpeg')).toBe(false);
  });
});

describe('coverage', () => {
  it('has a type for every preset, so no conversion is saved as an unknown blob', () => {
    for (const preset of PRESETS) {
      expect(mimeTypeFor(`Trip 2026${preset.extension}`), preset.id).not.toBe(UNKNOWN_MIME_TYPE);
    }
  });

  it('has a subtitle type for every extraction format', () => {
    for (const format of Object.keys(SUBTITLE_EXTENSIONS) as SubtitleFormat[]) {
      const name = subtitleOutputName('Trip 2026.mkv', format);
      expect(isTextMimeType(mimeTypeFor(name)), format).toBe(true);
    }
  });
});

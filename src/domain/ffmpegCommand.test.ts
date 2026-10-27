import { describe, expect, it } from 'vitest';

import { buildConversionArgv, InvalidCommandError } from './ffmpegCommand';
import { getPreset } from './presets';

const mp4 = getPreset('mp4');
const hardware = { encoder: 'h264_mediacodec', pixelFormat: 'nv12' as const };

describe('buildConversionArgv', () => {
  it('builds the MP4 hardware-encoder command with audio', () => {
    const argv = buildConversionArgv({
      preset: mp4,
      inputPath: '/data/user/0/dev.transmute/cache/picked.mp4',
      outputPath: '/data/user/0/dev.transmute/cache/job-1/picked.mp4',
      encoder: hardware,
      sourceHasAudio: true,
    });

    expect(argv).toEqual([
      '-y',
      '-hide_banner',
      '-i',
      '/data/user/0/dev.transmute/cache/picked.mp4',
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'h264_mediacodec',
      '-b:v',
      '2M',
      '-pix_fmt',
      'nv12',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '/data/user/0/dev.transmute/cache/job-1/picked.mp4',
    ]);
  });

  it('drops audio arguments and adds -an when the source has no audio', () => {
    const argv = buildConversionArgv({
      preset: mp4,
      inputPath: '/cache/silent.mov',
      outputPath: '/cache/job-2/silent.mp4',
      encoder: hardware,
      sourceHasAudio: false,
    });

    expect(argv).toContain('-an');
    expect(argv).not.toContain('-c:a');
    expect(argv).not.toContain('0:a:0?');
  });

  it('uses planar YUV for the software encoder', () => {
    const argv = buildConversionArgv({
      preset: mp4,
      inputPath: '/cache/in.mp4',
      outputPath: '/cache/job-3/in.mp4',
      encoder: { encoder: 'libopenh264', pixelFormat: 'yuv420p' },
      sourceHasAudio: true,
    });

    expect(argv[argv.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
    expect(argv[argv.indexOf('-c:v') + 1]).toBe('libopenh264');
  });

  it('keeps hostile names as single argv entries', () => {
    const hostile = '/cache/; rm -rf / "quoted" ünïcode 🎬.mp4';
    const argv = buildConversionArgv({
      preset: mp4,
      inputPath: hostile,
      outputPath: '/cache/job-4/out.mp4',
      encoder: hardware,
      sourceHasAudio: true,
    });

    expect(argv.filter((entry) => entry === hostile)).toHaveLength(1);
    expect(argv[3]).toBe(hostile);
    // No entry is ever a concatenation of two arguments.
    expect(argv.some((entry) => entry.includes(' -i '))).toBe(false);
  });

  it('refuses a missing encoder', () => {
    expect(() =>
      buildConversionArgv({
        preset: mp4,
        inputPath: '/cache/in.mp4',
        outputPath: '/cache/job-5/in.mp4',
        sourceHasAudio: true,
      }),
    ).toThrow(InvalidCommandError);
  });

  it('refuses empty, null-byte, and option-like paths', () => {
    const base = { preset: mp4, encoder: hardware, sourceHasAudio: true };
    expect(() =>
      buildConversionArgv({ ...base, inputPath: '   ', outputPath: '/cache/job-6/a.mp4' }),
    ).toThrow(/input path is empty/);
    expect(() =>
      buildConversionArgv({ ...base, inputPath: '/cache/a\0.mp4', outputPath: '/cache/b.mp4' }),
    ).toThrow(/null byte/);
    expect(() =>
      buildConversionArgv({ ...base, inputPath: '/cache/a.mp4', outputPath: '-o.mp4' }),
    ).toThrow(/starts with "-"/);
  });

  it('refuses to overwrite the input', () => {
    expect(() =>
      buildConversionArgv({
        preset: mp4,
        inputPath: '/cache/same.mp4',
        outputPath: '/cache/same.mp4',
        encoder: hardware,
        sourceHasAudio: true,
      }),
    ).toThrow(/overwrite the source/);
  });

  it.each([
    ['mp3', ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k']],
    ['flac', ['-vn', '-c:a', 'flac']],
    ['opus', ['-vn', '-c:a', 'libopus', '-b:a', '128k']],
  ] as const)('maps the %s preset to its audio target', (id, expected) => {
    const preset = getPreset(id);
    const argv = buildConversionArgv({
      preset,
      inputPath: '/cache/song.wav',
      outputPath: `/cache/job-7/song${preset.extension}`,
      sourceHasAudio: true,
    });

    const start = argv.indexOf('-vn');
    expect(argv.slice(start, start + expected.length)).toEqual([...expected]);
    expect(argv[argv.length - 1]).toBe(`/cache/job-7/song${preset.extension}`);
    expect(argv).not.toContain('-c:v');
  });
});

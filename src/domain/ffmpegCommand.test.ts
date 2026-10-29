import { describe, expect, it } from 'vitest';

import { buildConversionArgv, buildExtractionArgv, InvalidCommandError } from './ffmpegCommand';
import { getPreset, PRESETS } from './presets';

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
    ['m4a', ['-vn', '-c:a', 'aac', '-b:a', '192k']],
    ['wav', ['-vn', '-c:a', 'pcm_s16le']],
    ['flac', ['-vn', '-c:a', 'flac']],
    ['ogg', ['-vn', '-c:a', 'libvorbis', '-b:a', '160k']],
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
    expect(argv.slice(start - 2, start)).toEqual(['-map', '0:a:0']);
    expect(argv.slice(start, start + expected.length)).toEqual([...expected]);
    expect(argv[argv.length - 1]).toBe(`/cache/job-7/song${preset.extension}`);
    expect(argv).not.toContain('-c:v');
  });
});

describe('container-specific arguments', () => {
  function buildFor(id: 'mp4' | 'mkv' | 'mov' | 'webm', encoderName: string) {
    const preset = getPreset(id);
    return buildConversionArgv({
      preset,
      inputPath: '/cache/in.mkv',
      outputPath: `/cache/job-8/out${preset.extension}`,
      encoder: { encoder: encoderName, pixelFormat: 'yuv420p' },
      sourceHasAudio: true,
    });
  }

  it('front-loads the index in both QuickTime containers', () => {
    expect(buildFor('mp4', 'libopenh264').slice(-3)).toEqual([
      '-movflags',
      '+faststart',
      '/cache/job-8/out.mp4',
    ]);
    expect(buildFor('mov', 'libopenh264').slice(-3)).toEqual([
      '-movflags',
      '+faststart',
      '/cache/job-8/out.mov',
    ]);
  });

  it('leaves Matroska and WebM without the QuickTime flag', () => {
    expect(buildFor('mkv', 'libopenh264')).not.toContain('-movflags');
    expect(buildFor('webm', 'libvpx-vp9')).not.toContain('-movflags');
  });

  it('asks libvpx for real-time mode in the WebM command only', () => {
    const webm = buildFor('webm', 'libvpx-vp9');

    expect(webm[webm.indexOf('-deadline') + 1]).toBe('realtime');
    expect(webm[webm.indexOf('-cpu-used') + 1]).toBe('5');
    expect(webm[webm.indexOf('-c:a') + 1]).toBe('libopus');
    expect(buildFor('mp4', 'libopenh264')).not.toContain('-deadline');
  });
});

describe.each(PRESETS.filter((preset) => preset.kind === 'video'))(
  '$label video command',
  (preset) => {
    it('is complete and ends at the output path', () => {
      const argv = buildConversionArgv({
        preset,
        inputPath: '/cache/in.mp4',
        outputPath: `/cache/job-10/out${preset.extension}`,
        encoder: {
          encoder: preset.videoEncoderCandidates[0] ?? 'libopenh264',
          pixelFormat: 'yuv420p',
        },
        sourceHasAudio: true,
      });

      expect(argv.slice(0, 4)).toEqual(['-y', '-hide_banner', '-i', '/cache/in.mp4']);
      expect(argv[argv.indexOf('-c:a') + 1]).toBe(preset.audioCodec);
      expect(argv.at(-1)).toBe(`/cache/job-10/out${preset.extension}`);
    });
  },
);

describe('buildConversionArgv — sidecar subtitles', () => {
  const sidecar = { path: '/cache/jobs/job-11/Trip 2026.srt', format: 'srt' as const };

  function buildWith(id: 'mp4' | 'mkv' | 'webm', codec: string) {
    const preset = getPreset(id);
    return buildConversionArgv({
      preset,
      inputPath: '/cache/in.mp4',
      outputPath: `/cache/job-11/out${preset.extension}`,
      encoder: { encoder: 'libopenh264', pixelFormat: 'yuv420p' },
      sourceHasAudio: true,
      sidecar: { ...sidecar, codec },
    });
  }

  it('adds the sidecar as a second, explicitly SubRip input', () => {
    const argv = buildWith('mp4', 'mov_text');

    expect(argv.slice(0, 8)).toEqual([
      '-y',
      '-hide_banner',
      '-i',
      '/cache/in.mp4',
      '-f',
      'srt',
      '-i',
      '/cache/jobs/job-11/Trip 2026.srt',
    ]);
  });

  it('maps the sidecar stream and encodes it with the container codec', () => {
    const argv = buildWith('mp4', 'mov_text');

    expect(argv[argv.indexOf('1:s:0') - 1]).toBe('-map');
    expect(argv[argv.indexOf('-c:s') + 1]).toBe('mov_text');
    // The track is marked default so a player shows subtitles without a menu trip.
    expect(argv).toContain('language=und');
    expect(argv[argv.indexOf('-disposition:s:0') + 1]).toBe('default');
  });

  it('keeps the sidecar path as a single argument, hostile or not', () => {
    const hostile = '/cache/; rm -rf / "sub".srt';
    const argv = buildConversionArgv({
      preset: getPreset('mkv'),
      inputPath: '/cache/in.mp4',
      outputPath: '/cache/job-11/out.mkv',
      encoder: { encoder: 'libopenh264', pixelFormat: 'yuv420p' },
      sourceHasAudio: true,
      sidecar: { path: hostile, format: 'srt', codec: 'srt' },
    });

    expect(argv.filter((entry) => entry === hostile)).toHaveLength(1);
    expect(argv.some((entry) => entry.includes(' -i '))).toBe(false);
  });

  it('leaves the command untouched when no sidecar is chosen', () => {
    const withSidecar = buildWith('mkv', 'srt');
    const without = buildConversionArgv({
      preset: getPreset('mkv'),
      inputPath: '/cache/in.mp4',
      outputPath: '/cache/job-11/out.mkv',
      encoder: { encoder: 'libopenh264', pixelFormat: 'yuv420p' },
      sourceHasAudio: true,
    });

    expect(without).not.toContain('-c:s');
    expect(without).not.toContain('-f');
    expect(withSidecar.length).toBeGreaterThan(without.length);
  });

  it('still disables audio when the source is silent and a sidecar is present', () => {
    const argv = buildConversionArgv({
      preset: getPreset('mp4'),
      inputPath: '/cache/silent.mp4',
      outputPath: '/cache/job-12/silent.mp4',
      encoder: { encoder: 'libopenh264', pixelFormat: 'yuv420p' },
      sourceHasAudio: false,
      sidecar: { ...sidecar, codec: 'mov_text' },
    });

    expect(argv).toContain('-an');
    expect(argv).toContain('-c:s');
  });

  it('refuses a sidecar on an audio-only preset', () => {
    expect(() =>
      buildConversionArgv({
        preset: getPreset('mp3'),
        inputPath: '/cache/song.wav',
        outputPath: '/cache/job-13/song.mp3',
        sourceHasAudio: true,
        sidecar: { ...sidecar, codec: 'mov_text' },
      }),
    ).toThrow(/cannot carry a subtitle track/);
  });

  it('refuses an unusable sidecar path', () => {
    expect(() =>
      buildConversionArgv({
        preset: getPreset('mp4'),
        inputPath: '/cache/in.mp4',
        outputPath: '/cache/job-14/in.mp4',
        encoder: { encoder: 'libopenh264', pixelFormat: 'yuv420p' },
        sourceHasAudio: true,
        sidecar: { path: '   ', format: 'srt', codec: 'mov_text' },
      }),
    ).toThrow(/subtitle path is empty/);
  });

  it('refuses the source file as its own sidecar', () => {
    expect(() =>
      buildConversionArgv({
        preset: getPreset('mp4'),
        inputPath: '/cache/in.mp4',
        outputPath: '/cache/job-15/in.mp4',
        encoder: { encoder: 'libopenh264', pixelFormat: 'yuv420p' },
        sourceHasAudio: true,
        sidecar: { path: '/cache/in.mp4', format: 'srt', codec: 'mov_text' },
      }),
    ).toThrow(/not a subtitle input/);
  });
});


describe('buildExtractionArgv', () => {
  it('maps one subtitle stream and writes it as SubRip', () => {
    expect(
      buildExtractionArgv({
        inputPath: '/cache/in.mkv',
        outputPath: '/cache/job-16/in.srt',
        streamIndex: 0,
        format: 'srt',
      }),
    ).toEqual([
      '-y',
      '-hide_banner',
      '-i',
      '/cache/in.mkv',
      '-map',
      '0:s:0',
      '-c:s',
      'srt',
      '/cache/job-16/in.srt',
    ]);
  });

  it('writes WebVTT and honours the chosen track', () => {
    const argv = buildExtractionArgv({
      inputPath: '/cache/in.mkv',
      outputPath: '/cache/job-17/in.vtt',
      streamIndex: 2,
      format: 'vtt',
    });

    expect(argv[argv.indexOf('-map') + 1]).toBe('0:s:2');
    expect(argv[argv.indexOf('-c:s') + 1]).toBe('webvtt');
  });

  it('never touches the video or audio streams', () => {
    const argv = buildExtractionArgv({
      inputPath: '/cache/in.mkv',
      outputPath: '/cache/job-18/in.srt',
      streamIndex: 0,
      format: 'srt',
    });

    expect(argv).not.toContain('-c:v');
    expect(argv).not.toContain('-c:a');
    expect(argv).not.toContain('-vn');
  });

  it('refuses a negative or fractional track number', () => {
    const base = {
      inputPath: '/cache/in.mkv',
      outputPath: '/cache/job-19/in.srt',
      format: 'srt' as const,
    };

    expect(() => buildExtractionArgv({ ...base, streamIndex: -1 })).toThrow(/valid track number/);
    expect(() => buildExtractionArgv({ ...base, streamIndex: 1.5 })).toThrow(/valid track number/);
  });

  it('refuses to write over the input', () => {
    expect(() =>
      buildExtractionArgv({
        inputPath: '/cache/in.srt',
        outputPath: '/cache/in.srt',
        streamIndex: 0,
        format: 'srt',
      }),
    ).toThrow(/overwrite the source/);
  });

  it('refuses an option-like output path', () => {
    expect(() =>
      buildExtractionArgv({
        inputPath: '/cache/in.mkv',
        outputPath: '-out.srt',
        streamIndex: 0,
        format: 'srt',
      }),
    ).toThrow(/starts with "-"/);
  });
});


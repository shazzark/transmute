/**
 * FFmpeg argv builder.
 *
 * The single place where a preset becomes a command. It returns an argument
 * array and never a shell string: paths are separate argv entries, so a file
 * called `; rm -rf ~` stays a file name (TR-03).
 */

import type { Preset } from './presets';

export interface VideoEncoderSelection {
  readonly encoder: string;
  readonly pixelFormat: 'nv12' | 'yuv420p';
}

export interface BuildArgvInput {
  readonly preset: Preset;
  readonly inputPath: string;
  readonly outputPath: string;
  /** Required for video presets; ignored by audio-only presets. */
  readonly encoder?: VideoEncoderSelection;
  /**
   * Whether the probed source has an audio stream. A video preset without audio
   * gets `-an` instead of audio codec arguments, so FFmpeg is not asked to
   * encode a stream that does not exist.
   */
  readonly sourceHasAudio: boolean;
}

export class InvalidCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCommandError';
  }
}

/**
 * Containers whose index belongs at the front so a half-downloaded file already
 * plays. Both QuickTime flavours use the same flag.
 */
const FASTSTART_CONTAINERS: readonly string[] = ['MP4', 'MOV'];

function assertUsablePath(label: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidCommandError(`The ${label} path is empty.`);
  }
  if (value.includes('\0')) {
    throw new InvalidCommandError(`The ${label} path contains a null byte.`);
  }
  // The engine takes a path, not an option; a leading dash would be read as one.
  if (value.startsWith('-')) {
    throw new InvalidCommandError(`The ${label} path starts with "-", which FFmpeg reads as an option.`);
  }
}

/**
 * Builds the argument array for one conversion.
 *
 * @throws {InvalidCommandError} when the paths are unusable or a video preset
 *         is built without an encoder choice, so a malformed command never
 *         reaches the engine.
 */
export function buildConversionArgv(input: BuildArgvInput): string[] {
  const { preset, inputPath, outputPath, encoder, sourceHasAudio } = input;

  assertUsablePath('input', inputPath);
  assertUsablePath('output', outputPath);
  if (inputPath === outputPath) {
    throw new InvalidCommandError('The output path is the input path; that would overwrite the source.');
  }

  const argv: string[] = ['-y', '-hide_banner', '-i', inputPath];

  if (preset.kind === 'video') {
    if (!encoder) {
      throw new InvalidCommandError(`The ${preset.label} preset needs a resolved video encoder.`);
    }
    argv.push('-map', '0:v:0');
    if (sourceHasAudio) {
      argv.push('-map', '0:a:0?');
    }

    argv.push('-c:v', encoder.encoder);
    if (preset.videoBitrate) {
      argv.push('-b:v', preset.videoBitrate);
    }
    argv.push('-pix_fmt', encoder.pixelFormat);
    // WebM's libvpx options live here; no other preset has any.
    if (preset.extraVideoArgs) {
      argv.push(...preset.extraVideoArgs);
    }

    if (sourceHasAudio && preset.audioCodec) {
      argv.push('-c:a', preset.audioCodec);
      if (preset.audioBitrate) {
        argv.push('-b:a', preset.audioBitrate);
      }
    } else {
      argv.push('-an');
    }

    if (FASTSTART_CONTAINERS.includes(preset.container)) {
      // Puts the index at the front so the file plays while it streams.
      argv.push('-movflags', '+faststart');
    }
  } else {
    if (!preset.audioCodec) {
      throw new InvalidCommandError(`The ${preset.label} preset has no audio codec.`);
    }
    // First audio stream by name, not "whatever FFmpeg defaults to", so a file
    // with several tracks yields the same result every time.
    argv.push('-map', '0:a:0', '-vn', '-c:a', preset.audioCodec);
    if (preset.audioBitrate) {
      argv.push('-b:a', preset.audioBitrate);
    }
  }

  argv.push(outputPath);
  return argv;
}

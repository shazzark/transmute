/**
 * Encoder preference.
 *
 * The engine reports what the bundled FFmpeg build can write; this module turns
 * that inventory into one decision, or a specific failure. Hardware first,
 * software second, never a silent fallback to a different output (TD-8).
 */

import type { Preset } from './presets';

/** Smallest frame the Android MediaCodec encoders accept. */
export const HARDWARE_MIN_WIDTH = 176;
export const HARDWARE_MIN_HEIGHT = 144;

/** Android hardware encoders consume NV12; the software ones take planar YUV. */
const HARDWARE_ENCODERS: readonly string[] = ['h264_mediacodec', 'hevc_mediacodec'];

export type EncoderChoice =
  | {
      readonly ok: true;
      readonly encoder: string;
      readonly hardware: boolean;
      readonly pixelFormat: 'nv12' | 'yuv420p';
    }
  | {
      readonly ok: false;
      readonly reason: string;
      /** What the build would have needed to offer. */
      readonly candidates: readonly string[];
    };

export function isHardwareEncoder(encoder: string): boolean {
  return HARDWARE_ENCODERS.includes(encoder);
}

/** Pixel format FFmpeg must be told to use for this encoder. */
export function pixelFormatFor(encoder: string): 'nv12' | 'yuv420p' {
  return isHardwareEncoder(encoder) ? 'nv12' : 'yuv420p';
}

/**
 * Picks the first available candidate, in preference order.
 *
 * Returns a failure value rather than throwing so callers decide how to phrase
 * it; the UI shows `reason` verbatim and never a bare "Error" (TR-30).
 */
export function chooseVideoEncoder(
  preset: Preset,
  availableEncoders: readonly string[],
): EncoderChoice {
  const candidates = preset.videoEncoderCandidates;
  if (candidates.length === 0) {
    return { ok: false, reason: `${preset.label} needs no video encoder.`, candidates };
  }

  const encoder = candidates.find((candidate) => availableEncoders.includes(candidate));
  if (!encoder) {
    return {
      ok: false,
      reason: `This build has no ${preset.container} video encoder. Needed one of: ${candidates.join(', ')}.`,
      candidates,
    };
  }

  return {
    ok: true,
    encoder,
    hardware: isHardwareEncoder(encoder),
    pixelFormat: pixelFormatFor(encoder),
  };
}

export type AudioEncoderChoice =
  | { readonly ok: true; readonly encoder: string }
  | {
      readonly ok: false;
      readonly reason: string;
      /** What the build would have needed to offer. */
      readonly candidates: readonly string[];
    };

/**
 * The audio side of the same rule.
 *
 * A preset names exactly one audio codec, and the build either has that encoder
 * or the job is refused by name. There is no candidate ladder here: a second
 * codec would mean a different output format, which TD-8 forbids.
 */
export function chooseAudioEncoder(
  preset: Preset,
  availableEncoders: readonly string[],
): AudioEncoderChoice {
  const codec = preset.audioCodec;
  if (codec === null) {
    return { ok: false, reason: `${preset.label} has no audio track.`, candidates: [] };
  }

  if (!availableEncoders.includes(codec)) {
    return {
      ok: false,
      reason: `This build has no ${preset.container} audio encoder. Needed: ${codec}.`,
      candidates: [codec],
    };
  }

  return { ok: true, encoder: codec };
}

export interface PresetAvailability {
  readonly available: boolean;
  /** Why the tile is disabled, in words; empty when it is available. */
  readonly reason: string;
}

/**
 * Capability detection for the format grid.
 *
 * `availableEncoders` is the engine's own `-encoders` report, or `null` until it
 * has been read. An unknown build must not disable everything at first paint, so
 * the tile stays tappable and a missing codec surfaces as a named failure
 * instead of a dead grid.
 */
export function resolveAvailability(
  preset: Preset,
  availableEncoders: readonly string[] | null,
): PresetAvailability {
  if (availableEncoders === null) {
    return { available: true, reason: '' };
  }

  const choice =
    preset.kind === 'video'
      ? chooseVideoEncoder(preset, availableEncoders)
      : chooseAudioEncoder(preset, availableEncoders);

  return choice.ok ? { available: true, reason: '' } : { available: false, reason: 'Not in this build' };
}

/**
 * Hardware encoders reject frames below 176×144, so a source smaller than that
 * cannot use them. Callers pass the probed dimensions; unknown dimensions skip
 * the check rather than guessing.
 */
export function meetsHardwareMinimum(
  width: number | undefined,
  height: number | undefined,
): boolean {
  if (width === undefined || height === undefined) {
    return true;
  }
  return width >= HARDWARE_MIN_WIDTH && height >= HARDWARE_MIN_HEIGHT;
}

/**
 * Probe result parsing.
 *
 * FFprobe prints numbers as strings and only what the container exposes, so
 * every field here is optional and every conversion is defensive. The output is
 * what the UI shows and what the argv builder needs (duration, audio presence,
 * frame size for the hardware-encoder check) — nothing more (TR-17).
 */

/** The subset of `munim-ffmpeg`'s `MediaInformation` this module reads. */
export interface RawProbeStream {
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly duration?: string;
  readonly [key: string]: unknown;
}

export interface RawProbeInformation {
  readonly format?: {
    readonly duration?: string;
    readonly format_name?: string;
    readonly [key: string]: unknown;
  };
  readonly streams?: readonly RawProbeStream[];
  readonly [key: string]: unknown;
}

export interface MediaSummary {
  /** `null` when no stream or format reported a duration. */
  readonly durationMs: number | null;
  readonly durationLabel: string | null;
  readonly container: string | null;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
}

function parseSeconds(value: string | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const seconds = Number.parseFloat(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return seconds;
}

function positiveInt(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

/** `m:ss`, `h:mm:ss`, or `null` when the duration is unknown. */
export function formatDuration(milliseconds: number | null): string | null {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds <= 0) {
    return null;
  }
  const totalSeconds = Math.round(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Turns an FFprobe report into the summary the screen displays.
 *
 * A report with no streams is not an error by itself: it means the engine could
 * not read the file, and the caller decides the message.
 */
export function summariseProbe(information: RawProbeInformation | null | undefined): MediaSummary {
  const streams = Array.isArray(information?.streams) ? information.streams : [];
  const video = streams.find((stream) => stream?.codec_type === 'video');
  const audio = streams.find((stream) => stream?.codec_type === 'audio');

  const seconds =
    parseSeconds(information?.format?.duration) ??
    parseSeconds(video?.duration) ??
    parseSeconds(audio?.duration);
  const durationMs = seconds === null ? null : Math.round(seconds * 1000);

  return {
    durationMs,
    durationLabel: formatDuration(durationMs),
    container: information?.format?.format_name ?? null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    width: positiveInt(video?.width),
    height: positiveInt(video?.height),
    hasVideo: video !== undefined,
    hasAudio: audio !== undefined,
  };
}

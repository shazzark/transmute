/**
 * Subtitle sidecars, their validation, and what each container can carry.
 *
 * Two separate facts about subtitles live here. One is what a sidecar must look
 * like before the engine is asked to read it; the other is which container can
 * hold a subtitle track and under which codec. Both are pure — no React Native
 * imports — so the parser, the matrix, and the naming rule are tested in Node
 * (TR-21).
 *
 * Only SubRip (`.srt`) sidecars are accepted for embedding in this phase. The
 * README's ASS claim is not silently approximated: `detectSidecarFormat` returns
 * `null` for anything else, so the screen refuses that file by name instead of
 * handing FFmpeg something it would mangle (TR-19).
 */

import { buildOutputName } from './naming';
import type { Preset } from './presets';
import type { SubtitleTrack } from './probe';

/** Text subtitle formats this app can write out. */
export type SubtitleFormat = 'srt' | 'vtt';

/** Sidecar formats accepted as an input, which is a narrower set. */
export type SidecarFormat = 'srt';

export const SUBTITLE_EXTENSIONS: Record<SubtitleFormat, string> = {
  srt: '.srt',
  vtt: '.vtt',
};

/** `-c:s` value for a text subtitle format. */
export function subtitleCodecFor(format: SubtitleFormat): string {
  return format === 'srt' ? 'srt' : 'webvtt';
}

/**
 * The demuxer to force for a sidecar input.
 *
 * Stated explicitly with `-f` so a file that has the right text but an
 * unhelpful name is still read as SubRip instead of being guessed at.
 */
export function subtitleDemuxerFor(format: SidecarFormat): string {
  return SUBTITLE_EXTENSIONS[format].slice(1);
}

/**
 * The sidecar format a file name claims, or `null`.
 *
 * The extension is the only trustworthy signal before the text is read: Android
 * reports `.srt` under at least three MIME types, so the MIME type is ignored
 * and the content is validated separately.
 */
export function detectSidecarFormat(fileName: string): SidecarFormat | null {
  const name = fileName.trim().toLowerCase();
  return name.endsWith(SUBTITLE_EXTENSIONS.srt) ? 'srt' : null;
}

/** Why a sidecar was refused, in a form the caller turns into words. */
export type SidecarProblem = 'wrong-type' | 'empty' | 'binary' | 'no-cues' | 'bad-timing';

export interface SidecarProblemDetail {
  readonly problem: SidecarProblem;
  /** 1-based line number of the offending cue, when the problem sits on one. */
  readonly line: number | null;
}

export type SrtValidation =
  | {
      readonly ok: true;
      readonly cueCount: number;
      /** Running time of the first cue and the last cue's end, as `m:ss`. */
      readonly firstCueLabel: string | null;
      readonly lastCueLabel: string | null;
    }
  | ({ readonly ok: false } & SidecarProblemDetail);

/**
 * One cue's timing line.
 *
 * Tolerant in the two places real files vary — the fraction separator (`,` or
 * `.`) and optional hours (`00:01,000`) — and forgiving about anything after the
 * end timestamp, which old SubRip files use for `X1:`/`Y1:` coordinates.
 */
const TIMING_LINE =
  /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

function timeMs(
  hours: string | undefined,
  minutes: string,
  seconds: string,
  fraction: string,
): number {
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  const wholeSeconds = Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
  return wholeSeconds * 1000 + milliseconds;
}

/**
 * A cue time as `m:ss`, or `h:mm:ss` past an hour.
 *
 * Separate from `formatDuration` on purpose: that one returns `null` for zero,
 * and a cue at `00:00:00,000` is both legal and common.
 */
function cueLabel(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Reads the cue times out of SubRip text.
 *
 * A cue index is not required, because plenty of files in the wild omit it. What
 * is required is at least one timing line whose end is after its start: without
 * that there is nothing for FFmpeg to embed, and the user would get an empty
 * track with no explanation (Phase 6 acceptance 3).
 */
export function validateSrt(text: string): SrtValidation {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, problem: 'empty', line: null };
  }
  if (text.includes('\u0000')) {
    return { ok: false, problem: 'binary', line: null };
  }

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let cueCount = 0;
  let firstMs: number | null = null;
  let lastEndMs: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.includes('-->')) {
      continue;
    }

    const match = TIMING_LINE.exec(line);
    if (!match) {
      return { ok: false, problem: 'bad-timing', line: index + 1 };
    }

    const start = timeMs(match[1], match[2] ?? '0', match[3] ?? '0', match[4] ?? '0');
    const end = timeMs(match[5], match[6] ?? '0', match[7] ?? '0', match[8] ?? '0');
    if (end <= start) {
      return { ok: false, problem: 'bad-timing', line: index + 1 };
    }

    cueCount += 1;
    if (firstMs === null) {
      firstMs = start;
    }
    lastEndMs = end;
  }

  if (cueCount === 0) {
    return { ok: false, problem: 'no-cues', line: null };
  }

  return {
    ok: true,
    cueCount,
    firstCueLabel: firstMs === null ? null : cueLabel(firstMs),
    lastCueLabel: lastEndMs === null ? null : cueLabel(lastEndMs),
  };
}

export interface SidecarValidationInput {
  /** Name as the picker reported it; the extension is what is trusted. */
  readonly name: string;
  readonly text: string;
}

export type SidecarValidation =
  | {
      readonly ok: true;
      readonly format: SidecarFormat;
      readonly cueCount: number;
      readonly firstCueLabel: string | null;
      readonly lastCueLabel: string | null;
    }
  | ({ readonly ok: false } & SidecarProblemDetail);

/** Validates a picked sidecar: the name first, then the text. */
export function validateSidecar({ name, text }: SidecarValidationInput): SidecarValidation {
  const format = detectSidecarFormat(name);
  if (format === null) {
    return { ok: false, problem: 'wrong-type', line: null };
  }

  const parsed = validateSrt(text);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    format,
    cueCount: parsed.cueCount,
    firstCueLabel: parsed.firstCueLabel,
    lastCueLabel: parsed.lastCueLabel,
  };
}

/** A sidecar that passed validation, with the path the engine will read. */
export interface ValidatedSidecar {
  readonly path: string;
  readonly name: string;
  readonly format: SidecarFormat;
  readonly cueCount: number;
  readonly firstCueLabel: string | null;
  readonly lastCueLabel: string | null;
}

export interface SubtitleTarget {
  /** `-c:s` value this container needs. */
  readonly codec: string;
  /** What the user should expect once the file is written. */
  readonly note: string;
}

/**
 * Per-container subtitle support (Phase 6 acceptance 4).
 *
 * The codec is not a preference: MP4 and MOV only carry `mov_text`, Matroska
 * carries SubRip as-is, and WebM only carries WebVTT. The notes say what players
 * do with the result, because promising "subtitles work" without that caveat
 * would be misleading.
 */
const CONTAINER_TARGETS: Record<string, SubtitleTarget> = {
  MP4: {
    codec: 'mov_text',
    note: 'MP4 holds subtitles as mov_text. VLC, mpv, and most desktop players show the track; some TV and gallery apps ignore it.',
  },
  MOV: {
    codec: 'mov_text',
    note: 'QuickTime holds subtitles as mov_text. QuickTime Player and VLC show the track.',
  },
  MKV: {
    codec: 'srt',
    note: 'Matroska keeps the SubRip text unchanged, so most players let you select the track.',
  },
  WEBM: {
    codec: 'webvtt',
    note: 'WebM only carries WebVTT, so the text is converted. Players that open WebM usually show the track.',
  },
};

/** Containers that can carry a subtitle track; audio-only presets cannot. */
export const SUBTITLE_CONTAINERS: readonly string[] = Object.keys(CONTAINER_TARGETS);

/** The codec and caveat for a preset, or `null` when it cannot hold subtitles. */
export function subtitleTargetFor(preset: Preset): SubtitleTarget | null {
  if (preset.kind !== 'video') {
    return null;
  }
  return CONTAINER_TARGETS[preset.container] ?? null;
}

export interface SubtitleAvailability {
  readonly available: boolean;
  /** Why embedding is refused, in words; empty when it is available. */
  readonly reason: string;
  readonly target: SubtitleTarget | null;
}

/**
 * Whether this preset can take a sidecar in this build.
 *
 * Mirrors `resolveAvailability` for the format grid: an unknown encoder list
 * leaves the option open, because a missing codec is then reported as a named
 * failure rather than by hiding the control.
 */
export function resolveSubtitleAvailability(
  preset: Preset,
  availableEncoders: readonly string[] | null,
): SubtitleAvailability {
  const target = subtitleTargetFor(preset);
  if (target === null) {
    return {
      available: false,
      reason: `${preset.label} cannot carry a subtitle track.`,
      target: null,
    };
  }

  if (availableEncoders !== null && !availableEncoders.includes(target.codec)) {
    return {
      available: false,
      reason: `This build has no ${target.codec} subtitle encoder.`,
      target,
    };
  }

  return { available: true, reason: '', target };
}

/** `Track 2 · eng · SubRip` — one line per embedded track in the panel. */
export function subtitleTrackLabel(track: SubtitleTrack): string {
  const parts = [`Track ${track.streamIndex + 1}`];
  // `und` is FFmpeg's "undetermined"; printing it would be noise, not information.
  if (track.language !== null && track.language !== 'und') {
    parts.push(track.language);
  }
  if (track.title !== null) {
    parts.push(track.title);
  }
  if (track.codec !== null) {
    parts.push(track.codec);
  }
  if (track.isDefault) {
    parts.push('default');
  }
  return parts.join(' · ');
}

/** `Trip 2026.mp4` + `srt` → `Trip 2026.srt`, through the shared naming rules. */
export function subtitleOutputName(sourceName: string, format: SubtitleFormat): string {
  return buildOutputName(sourceName, SUBTITLE_EXTENSIONS[format]);
}


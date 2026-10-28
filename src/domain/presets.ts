/**
 * Output preset catalogue.
 *
 * Pure data plus pure lookups: no React Native imports, so the argv builder and
 * every test that exercises it run in plain Node (TR-21).
 *
 * Phase 1 ships one usable preset (MP4 / H.264 / AAC). The other five are
 * defined here so the "Output format" selector can show the full matrix — the
 * audio presets because their command mapping is already decided (O-6) and
 * tested, MKV and WEBM because the selector must not change shape when Phase 5
 * switches them on. Every one of them stays disabled until then.
 */

export type PresetId = 'mp4' | 'mkv' | 'webm' | 'mp3' | 'flac' | 'opus';

export type PresetKind = 'video' | 'audio';

export interface Preset {
  readonly id: PresetId;
  /** Short label for the selector, e.g. `MP4`. */
  readonly label: string;
  /** Plain-word summary of the output, e.g. `H.264 video + AAC audio` (PR-03). */
  readonly detail: string;
  readonly kind: PresetKind;
  /** Container/format name shown in the summary. */
  readonly container: string;
  /** File extension including the dot, e.g. `.mp4`. */
  readonly extension: string;
  /** Ordered encoder candidates for video presets; empty for audio-only. */
  readonly videoEncoderCandidates: readonly string[];
  /** Audio codec passed to `-c:a`; `null` for presets without audio output. */
  readonly audioCodec: string | null;
  readonly audioBitrate: string | null;
  readonly videoBitrate: string | null;
  /** False while the preset exists but must not be offered yet (Phase 5). */
  readonly available: boolean;
  /** Shown next to a disabled preset; empty when available. */
  readonly unavailableReason: string;
}

const MP4: Preset = {
  id: 'mp4',
  label: 'MP4',
  detail: 'H.264 video + AAC audio',
  kind: 'video',
  container: 'MP4',
  extension: '.mp4',
  // Hardware first, then the software fallback the bundled build provides.
  videoEncoderCandidates: ['h264_mediacodec', 'libopenh264', 'h264_videotoolbox'],
  audioCodec: 'aac',
  audioBitrate: '128k',
  videoBitrate: '2M',
  available: true,
  unavailableReason: '',
};

/**
 * Matroska carries the same H.264/AAC pair as MP4, so its command is the MP4
 * one minus `-movflags`. It is defined but disabled until the Phase 5 matrix is
 * verified on a device.
 */
const MKV: Preset = {
  id: 'mkv',
  label: 'MKV',
  detail: 'Matroska · H.264 + AAC',
  kind: 'video',
  container: 'MKV',
  extension: '.mkv',
  videoEncoderCandidates: ['h264_mediacodec', 'libopenh264', 'h264_videotoolbox'],
  audioCodec: 'aac',
  audioBitrate: '128k',
  videoBitrate: '2M',
  available: false,
  unavailableReason: 'Coming next',
};

/**
 * WebM standardly takes VP9 + Opus. The candidates are provisional: Phase 5
 * must confirm the bundled build exposes them before this preset is switched
 * on, and a missing encoder surfaces as a named failure, never a silent
 * fallback to a different container (TD-8).
 */
const WEBM: Preset = {
  id: 'webm',
  label: 'WEBM',
  detail: 'VP9 video + Opus audio',
  kind: 'video',
  container: 'WEBM',
  extension: '.webm',
  videoEncoderCandidates: ['libvpx-vp9', 'libvpx'],
  audioCodec: 'libopus',
  audioBitrate: '128k',
  videoBitrate: '2M',
  available: false,
  unavailableReason: 'Coming next',
};

const MP3: Preset = {
  id: 'mp3',
  label: 'MP3',
  detail: 'MP3 audio only',
  kind: 'audio',
  container: 'MP3',
  extension: '.mp3',
  videoEncoderCandidates: [],
  audioCodec: 'libmp3lame',
  audioBitrate: '192k',
  videoBitrate: null,
  available: false,
  unavailableReason: 'Coming next',
};

const FLAC: Preset = {
  id: 'flac',
  label: 'FLAC',
  detail: 'FLAC audio, lossless',
  kind: 'audio',
  container: 'FLAC',
  extension: '.flac',
  videoEncoderCandidates: [],
  audioCodec: 'flac',
  audioBitrate: null,
  videoBitrate: null,
  available: false,
  unavailableReason: 'Coming next',
};

const OPUS: Preset = {
  id: 'opus',
  label: 'OPUS',
  detail: 'Opus audio only',
  kind: 'audio',
  container: 'Opus',
  extension: '.opus',
  videoEncoderCandidates: [],
  audioCodec: 'libopus',
  audioBitrate: '128k',
  videoBitrate: null,
  available: false,
  unavailableReason: 'Coming next',
};

/** Display order in the selector: video formats first, then audio-only. */
export const PRESETS: readonly Preset[] = [MP4, MKV, WEBM, MP3, FLAC, OPUS];

/** The only preset Phase 1 can run. */
export const DEFAULT_PRESET_ID: PresetId = 'mp4';

export function getPreset(id: PresetId): Preset {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`Unknown preset "${id}".`);
  }
  return preset;
}

/** Presets the UI may offer right now. */
export function availablePresets(): readonly Preset[] {
  return PRESETS.filter((preset) => preset.available);
}

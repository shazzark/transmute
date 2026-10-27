/**
 * Output preset catalogue.
 *
 * Pure data plus pure lookups: no React Native imports, so the argv builder and
 * every test that exercises it run in plain Node (TR-21).
 *
 * Phase 1 ships one usable preset (MP4 / H.264 / AAC). The audio presets are
 * defined here because their command mapping is already decided (O-6) and
 * tested, but the UI keeps them disabled until Phase 5.
 */

export type PresetId = 'mp4' | 'mp3' | 'flac' | 'opus';

export type PresetKind = 'video' | 'audio';

export interface Preset {
  readonly id: PresetId;
  /** Short label for the selector. */
  readonly label: string;
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
  label: 'MP4 (H.264)',
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

const MP3: Preset = {
  id: 'mp3',
  label: 'MP3',
  kind: 'audio',
  container: 'MP3',
  extension: '.mp3',
  videoEncoderCandidates: [],
  audioCodec: 'libmp3lame',
  audioBitrate: '192k',
  videoBitrate: null,
  available: false,
  unavailableReason: 'coming next',
};

const FLAC: Preset = {
  id: 'flac',
  label: 'FLAC',
  kind: 'audio',
  container: 'FLAC',
  extension: '.flac',
  videoEncoderCandidates: [],
  audioCodec: 'flac',
  audioBitrate: null,
  videoBitrate: null,
  available: false,
  unavailableReason: 'coming next',
};

const OPUS: Preset = {
  id: 'opus',
  label: 'Opus',
  kind: 'audio',
  container: 'Opus',
  extension: '.opus',
  videoEncoderCandidates: [],
  audioCodec: 'libopus',
  audioBitrate: '128k',
  videoBitrate: null,
  available: false,
  unavailableReason: 'coming next',
};

/** Display order in the selector. */
export const PRESETS: readonly Preset[] = [MP4, MP3, FLAC, OPUS];

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

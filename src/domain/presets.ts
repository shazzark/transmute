/**
 * Output preset catalogue.
 *
 * Pure data plus pure lookups: no React Native imports, so the argv builder and
 * every test that exercises it run in plain Node (TR-21).
 *
 * The catalogue is the whole advertised matrix: four video containers and six
 * audio targets. Whether a preset can actually run is a property of the bundled
 * FFmpeg build, not of this file — `resolveAvailability` in `encoders.ts`
 * compares a preset against the engine's own encoder list, so a build without a
 * codec disables that tile instead of writing a broken file (TD-8). No preset
 * ever falls back to a different container or codec.
 */

export type PresetId =
  | 'mp4'
  | 'mkv'
  | 'mov'
  | 'webm'
  | 'mp3'
  | 'm4a'
  | 'wav'
  | 'flac'
  | 'ogg'
  | 'opus';

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
  /**
   * Codec passed to `-c:a`; `null` for a preset with no audio output. On the
   * audio presets this string is also the encoder name capability detection
   * looks for in the build (`libmp3lame`, `flac`, `pcm_s16le`, …).
   */
  readonly audioCodec: string | null;
  readonly audioBitrate: string | null;
  readonly videoBitrate: string | null;
  /**
   * Arguments only this preset needs, inserted after `-pix_fmt`. WebM uses it to
   * put libvpx in real-time mode: the default `good` deadline turns a phone
   * encode from minutes into hours.
   */
  readonly extraVideoArgs?: readonly string[];
}

/** Hardware H.264 first, then the software fallback the bundled build provides. */
const H264_ENCODERS: readonly string[] = [
  'h264_mediacodec',
  'libopenh264',
  'h264_videotoolbox',
];

const MP4: Preset = {
  id: 'mp4',
  label: 'MP4',
  detail: 'H.264 video + AAC audio',
  kind: 'video',
  container: 'MP4',
  extension: '.mp4',
  videoEncoderCandidates: H264_ENCODERS,
  audioCodec: 'aac',
  audioBitrate: '128k',
  videoBitrate: '2M',
};

/** Matroska carries the same H.264/AAC pair; only the container changes. */
const MKV: Preset = {
  id: 'mkv',
  label: 'MKV',
  detail: 'Matroska · H.264 + AAC',
  kind: 'video',
  container: 'MKV',
  extension: '.mkv',
  videoEncoderCandidates: H264_ENCODERS,
  audioCodec: 'aac',
  audioBitrate: '128k',
  videoBitrate: '2M',
};

/**
 * QuickTime: the same H.264/AAC pair in a `.mov` wrapper, which some editors and
 * older players prefer over MP4.
 */
const MOV: Preset = {
  id: 'mov',
  label: 'MOV',
  detail: 'QuickTime · H.264 + AAC',
  kind: 'video',
  container: 'MOV',
  extension: '.mov',
  videoEncoderCandidates: H264_ENCODERS,
  audioCodec: 'aac',
  audioBitrate: '128k',
  videoBitrate: '2M',
};

/**
 * WebM standardly takes VP9 + Opus. When the build has neither, the tile says so
 * and the job is refused by name — never silently written as another container.
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
  extraVideoArgs: ['-deadline', 'realtime', '-cpu-used', '5', '-row-mt', '1'],
};

/**
 * The audio-only targets. `audioCodec` is simultaneously the `-c:a` value and
 * the encoder name the build must expose, so one string drives both the command
 * and the capability check.
 */
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
};

/** AAC in the MP4 audio container; the same codec MP4 video tracks carry. */
const M4A: Preset = {
  id: 'm4a',
  label: 'M4A',
  detail: 'AAC audio only',
  kind: 'audio',
  container: 'M4A',
  extension: '.m4a',
  videoEncoderCandidates: [],
  audioCodec: 'aac',
  audioBitrate: '192k',
  videoBitrate: null,
};

/** Uncompressed PCM: the largest output, and the one every editor accepts. */
const WAV: Preset = {
  id: 'wav',
  label: 'WAV',
  detail: 'WAV audio, uncompressed',
  kind: 'audio',
  container: 'WAV',
  extension: '.wav',
  videoEncoderCandidates: [],
  audioCodec: 'pcm_s16le',
  audioBitrate: null,
  videoBitrate: null,
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
};

/** Ogg Vorbis: the audio `.ogg` files normally carry. */
const OGG: Preset = {
  id: 'ogg',
  label: 'OGG',
  detail: 'Vorbis audio only',
  kind: 'audio',
  container: 'OGG',
  extension: '.ogg',
  videoEncoderCandidates: [],
  audioCodec: 'libvorbis',
  audioBitrate: '160k',
  videoBitrate: null,
};

/** Opus in its own container; separate from OGG because the extension differs. */
const OPUS: Preset = {
  id: 'opus',
  label: 'OPUS',
  detail: 'Opus audio only',
  kind: 'audio',
  container: 'OPUS',
  extension: '.opus',
  videoEncoderCandidates: [],
  audioCodec: 'libopus',
  audioBitrate: '128k',
  videoBitrate: null,
};

/** Display order in the selector: video formats first, then audio-only. */
export const PRESETS: readonly Preset[] = [MP4, MKV, MOV, WEBM, MP3, M4A, WAV, FLAC, OGG, OPUS];

/** The preset a new job starts on. */
export const DEFAULT_PRESET_ID: PresetId = 'mp4';

export function getPreset(id: PresetId): Preset {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`Unknown preset "${id}".`);
  }
  return preset;
}

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SubtitleTrack } from '../../domain/probe';
import { savedLocation, type SaveState } from '../../domain/saveIntent';
import type { SubtitleState } from '../../domain/subtitleIntent';
import {
  SUBTITLE_CONTAINERS,
  subtitleTrackLabel,
  type SubtitleAvailability,
  type SubtitleFormat,
  type ValidatedSidecar,
} from '../../domain/subtitles';
import { metadataLine } from '../format';
import { color, radius, spacing, touchTarget, type, weight } from '../tokens';
import { Banner } from './Banner';
import { SavePanel } from './SavePanel';
import { SecondaryButton } from './SecondaryButton';

export interface SubtitlePanelProps {
  /** What the chosen output format can do with a subtitle track. */
  readonly availability: SubtitleAvailability;
  readonly state: SubtitleState;
  /** Copying the extracted file out of the cache; separate from the video's save. */
  readonly saveState: SaveState;
  /** Subtitle tracks inside the probed source, in stream order. */
  readonly tracks: readonly SubtitleTrack[];
  /** The track the user picked, or `null` to use the first one. */
  readonly selectedTrackIndex: number | null;
  /** True while another operation owns the screen, so nothing here is tappable. */
  readonly disabled: boolean;
  readonly onSelectTrack: (streamIndex: number) => void;
  readonly onChoose: () => void;
  readonly onClear: () => void;
  readonly onSelectFormat: (format: SubtitleFormat) => void;
  readonly onExtract: () => void;
  /** Saves the extracted file to a folder the user picks. */
  readonly onSaveSubtitles: () => void;
}

const FORMAT_LABELS: Record<SubtitleFormat, string> = { srt: 'SRT', vtt: 'VTT' };
const FORMATS: readonly SubtitleFormat[] = ['srt', 'vtt'];

/** The span a sidecar covers, so a mismatched file is visible before converting. */
function spanLabel(sidecar: ValidatedSidecar): string {
  const range =
    sidecar.firstCueLabel !== null && sidecar.lastCueLabel !== null
      ? `${sidecar.firstCueLabel} → ${sidecar.lastCueLabel}`
      : null;
  return metadataLine([`${sidecar.cueCount} ${sidecar.cueCount === 1 ? 'cue' : 'cues'}`, range]);
}

/**
 * Subtitle files in and subtitle tracks out.
 *
 * Both halves are always described in words: an unsupported container says which
 * formats can hold the track, an embedded track says what a player will do with
 * it, and nothing claims subtitles "work" in general (Phase 6 acceptance 4). The
 * two halves are independent, so one failing never hides the other.
 */
export function SubtitlePanel({
  availability,
  state,
  saveState,
  tracks,
  selectedTrackIndex,
  disabled,
  onSelectTrack,
  onChoose,
  onClear,
  onSelectFormat,
  onExtract,
  onSaveSubtitles,
}: SubtitlePanelProps): React.JSX.Element {
  const sidecar = state.sidecar;
  const activeTrack = selectedTrackIndex ?? tracks[0]?.streamIndex ?? null;
  const extracting = state.extractionStatus === 'running';
  const idle = disabled || state.sidecarStatus === 'choosing';
  /** Where the extracted file was actually put; `null` while only the cache has it. */
  const savedTo = savedLocation(saveState, 'folder');


  return (
    <View style={styles.panel}>
      <Text style={styles.label} allowFontScaling accessibilityRole="header">
        Subtitles
      </Text>

      <Text style={styles.heading} allowFontScaling>
        Add a subtitle file
      </Text>

      {availability.available ? (
        <>
          {sidecar === null ? (
            <SecondaryButton
              label={state.sidecarStatus === 'choosing' ? 'Choosing…' : 'Choose .srt file'}
              onPress={onChoose}
              disabled={idle}
              accessibilityLabel="Choose a SubRip subtitle file to embed in the converted video"
            />
          ) : (
            <View style={styles.chosen}>
              <Text style={styles.name} allowFontScaling numberOfLines={2}>
                {sidecar.name}
              </Text>
              <Text style={styles.detail} allowFontScaling>
                {spanLabel(sidecar)}
              </Text>
              <View style={styles.actions}>
                <SecondaryButton
                  label="Replace"
                  onPress={onChoose}
                  disabled={idle}
                  accessibilityLabel={`Choose a different subtitle file to replace ${sidecar.name}`}
                />
                <SecondaryButton
                  label="Remove"
                  onPress={onClear}
                  disabled={idle}
                  destructive
                  accessibilityLabel={`Remove ${sidecar.name} from the conversion`}
                />
              </View>
            </View>
          )}
          {availability.target ? (
            <Text style={styles.note} allowFontScaling>
              {availability.target.note}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.note} allowFontScaling>
          {availability.target === null
            ? `${availability.reason} Choose ${SUBTITLE_CONTAINERS.join(', ')} to embed a subtitle file.`
            : availability.reason}
        </Text>
      )}

      {state.sidecarStatus === 'failed' && state.sidecarFailure ? (
        <Banner
          variant="error"
          title={state.sidecarFailure.title}
          message={state.sidecarFailure.message}
          recovery={state.sidecarFailure.recovery}
          {...(state.sidecarFailure.detail ? { detail: state.sidecarFailure.detail } : {})}
        />
      ) : null}

      {tracks.length === 0 ? (
        <Text style={styles.note} allowFontScaling>
          This file has no subtitle track inside it, so there is nothing to extract.
        </Text>
      ) : (
        <View style={styles.extract}>
          <Text style={styles.heading} allowFontScaling>
            Take a track out
          </Text>

          <View accessibilityRole="radiogroup">
            {tracks.map((track) => {
              const selected = track.streamIndex === activeTrack;
              return (
                <Pressable
                  key={track.streamIndex}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: idle || extracting }}
                  accessibilityLabel={`${subtitleTrackLabel(track)}${selected ? ', selected' : ''}`}
                  disabled={idle || extracting}
                  onPress={() => onSelectTrack(track.streamIndex)}
                  style={({ pressed }) => [
                    styles.track,
                    selected ? styles.trackSelected : null,
                    pressed ? styles.trackPressed : null,
                  ]}
                >
                  <Text style={[styles.trackLabel, selected ? styles.trackLabelSelected : null]} allowFontScaling>
                    {subtitleTrackLabel(track)}
                  </Text>
                  {selected ? (
                    <Text
                      style={styles.check}
                      allowFontScaling
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.formatRow} accessibilityRole="radiogroup">
            {FORMATS.map((format) => {
              const selected = format === state.extractionFormat;
              return (
                <Pressable
                  key={format}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: idle || extracting }}
                  accessibilityLabel={`Extract as ${FORMAT_LABELS[format]}`}
                  disabled={idle || extracting}
                  onPress={() => onSelectFormat(format)}
                  style={({ pressed }) => [
                    styles.format,
                    selected ? styles.formatSelected : null,
                    pressed ? styles.formatPressed : null,
                  ]}
                >
                  <Text style={[styles.formatLabel, selected ? styles.formatLabelSelected : null]} allowFontScaling>
                    {FORMAT_LABELS[format]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <SecondaryButton
            label={extracting ? 'Extracting…' : `Extract subtitles as ${FORMAT_LABELS[state.extractionFormat]}`}
            onPress={onExtract}
            disabled={idle || extracting || activeTrack === null}
            accessibilityLabel={`Extract the selected subtitle track as ${FORMAT_LABELS[state.extractionFormat]}`}
          />

          {state.extractionStatus === 'done' && state.extractionOutput ? (
            <View style={styles.output}>
              <Text style={styles.detail} allowFontScaling>
                Extracted {state.extractionOutput.name}
              </Text>
              {/* Once a copy has landed, the folder it went to is the useful
                  path; the cache path is only shown while it is all there is. */}
              {savedTo === null ? (
                <>
                  <Text style={styles.detail} allowFontScaling>
                    In the app cache
                  </Text>
                  <Text style={styles.path} allowFontScaling selectable>
                    {state.extractionOutput.path}
                  </Text>
                  <Text style={styles.note} allowFontScaling>
                    The app cache is not visible in your files app, and the system may clear it.
                  </Text>
                </>
              ) : null}
              <SavePanel state={saveState} kind="subtitle" onSave={onSaveSubtitles} />
            </View>
          ) : null}

          {state.extractionStatus === 'failed' && state.extractionFailure ? (
            <Banner
              variant="error"
              title={state.extractionFailure.title}
              message={state.extractionFailure.message}
              recovery={state.extractionFailure.recovery}
              {...(state.extractionFailure.detail ? { detail: state.extractionFailure.detail } : {})}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
  },
  label: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heading: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    fontWeight: weight.title,
    color: color.textPrimary,
  },
  chosen: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  name: {
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
    fontWeight: weight.title,
    color: color.textPrimary,
  },
  detail: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  note: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
  extract: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  trackSelected: {
    borderColor: color.accent,
    backgroundColor: color.surfaceRaised,
  },
  trackPressed: {
    backgroundColor: color.surfaceRaised,
  },
  trackLabel: {
    flexShrink: 1,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.textPrimary,
  },
  trackLabelSelected: {
    color: color.accent,
  },
  check: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.accent,
  },
  formatRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  format: {
    minWidth: 72,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  formatSelected: {
    borderColor: color.accent,
    backgroundColor: color.surfaceRaised,
  },
  formatPressed: {
    backgroundColor: color.surfaceRaised,
  },
  formatLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: weight.label,
    color: color.textPrimary,
  },
  formatLabelSelected: {
    color: color.accent,
  },
  output: {
    gap: spacing.xs,
  },
  path: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.accent,
  },
});


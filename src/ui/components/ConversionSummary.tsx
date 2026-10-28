import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { buildOutputName } from '../../domain/naming';
import type { Preset } from '../../domain/presets';
import type { MediaSummary } from '../../domain/probe';
import { containerLabel, extensionLabel, metadataLine } from '../format';
import { color, radius, spacing, type, weight } from '../tokens';

export interface ConversionSummaryProps {
  sourceName: string;
  /** `null` while the file is still being probed. */
  summary: MediaSummary | null;
  preset: Preset;
}

/**
 * Source → output, side by side, so the screen states in one glance what the
 * app is about to do: this video becomes that file, in that format.
 *
 * The output name comes from the same pure function the pipeline uses, so what
 * the card promises is what the job writes (TR-16).
 */
export function ConversionSummary({
  sourceName,
  summary,
  preset,
}: ConversionSummaryProps): React.JSX.Element {
  const outputName = buildOutputName(sourceName, preset.extension);
  const sourceDetails = metadataLine([
    extensionLabel(sourceName) ?? containerLabel(summary?.container),
    summary?.videoCodec ?? null,
    summary?.audioCodec ?? null,
  ]);
  const outputDetails = `${preset.label} · ${preset.detail}`;
  const note =
    preset.kind === 'audio'
      ? 'The sound is written to a new file. Your original file is never changed.'
      : 'The new file is written separately. Your original video is never changed.';

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.row}>
        <View style={styles.side}>
          <Text style={styles.role} allowFontScaling>
            Source
          </Text>
          <Text style={styles.name} numberOfLines={2} allowFontScaling>
            {sourceName}
          </Text>
          <Text style={styles.meta} allowFontScaling>
            {sourceDetails.length > 0 ? sourceDetails : 'Video'}
          </Text>
        </View>

        <Text
          style={styles.arrow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          →
        </Text>

        <View style={styles.side}>
          <Text style={styles.role} allowFontScaling>
            Converted
          </Text>
          <Text style={[styles.name, styles.outputName]} numberOfLines={2} allowFontScaling>
            {outputName}
          </Text>
          <Text style={styles.meta} allowFontScaling>
            {outputDetails}
          </Text>
        </View>
      </View>

      <Text style={styles.note} allowFontScaling>
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  side: {
    flex: 1,
    gap: spacing.xs,
  },
  arrow: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    color: color.textSecondary,
  },
  role: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    fontWeight: weight.title,
    color: color.textPrimary,
  },
  outputName: {
    color: color.accent,
  },
  meta: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
  note: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
});

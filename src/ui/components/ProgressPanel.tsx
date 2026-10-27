import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatElapsed } from '../../domain/progress';
import { color, radius, spacing, type, weight } from '../tokens';

export type ProgressVariant = 'determinate' | 'indeterminate' | 'complete' | 'error';

export interface ProgressPanelProps {
  /** Phase sentence, e.g. "Converting to MP4 (H.264)". */
  phaseLabel: string;
  /** Whole percent, or null when the duration is unknown. */
  percent: number | null;
  elapsedMs: number;
  variant: ProgressVariant;
}

/**
 * The bar plus its readouts. Progress is exposed as an accessibility value and
 * announced at phase changes by the screen, not on every statistics tick.
 */
export function ProgressPanel({
  phaseLabel,
  percent,
  elapsedMs,
  variant,
}: ProgressPanelProps): React.JSX.Element {
  const fillColor =
    variant === 'error' ? color.danger : variant === 'complete' ? color.success : color.accent;
  const width = percent === null ? 100 : Math.max(0, Math.min(100, percent));

  return (
    <View style={styles.panel}>
      <Text style={styles.phase} allowFontScaling>
        {phaseLabel}
      </Text>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={phaseLabel}
        accessibilityValue={
          percent === null
            ? { text: 'Working' }
            : { min: 0, max: 100, now: Math.round(percent) }
        }
      >
        <View
          style={[
            styles.fill,
            { width: `${width}%`, backgroundColor: fillColor },
            variant === 'indeterminate' ? styles.fillIndeterminate : null,
          ]}
        />
      </View>

      <View style={styles.readouts}>
        <Text style={styles.readout} allowFontScaling>
          {percent === null ? 'Working' : `${Math.round(percent)}%`}
        </Text>
        <Text style={styles.readout} allowFontScaling>
          {formatElapsed(elapsedMs)} elapsed
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  phase: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    fontWeight: weight.label,
    color: color.textPrimary,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  fillIndeterminate: {
    opacity: 0.5,
  },
  readouts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  readout: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

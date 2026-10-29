import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatElapsed } from '../../domain/progress';
import { color, radius, spacing, type, weight } from '../tokens';
import { ProgressBar, type ProgressTone } from './ProgressBar';

export type ProgressVariant = 'determinate' | 'indeterminate' | 'complete' | 'error';

export interface ProgressPanelProps {
  /** Phase sentence, e.g. "Converting to MP4". */
  phaseLabel: string;
  /** Whole percent, or null when the duration is unknown. */
  percent: number | null;
  elapsedMs: number;
  variant: ProgressVariant;
}

const TONES: Record<ProgressVariant, ProgressTone> = {
  determinate: 'accent',
  indeterminate: 'accent',
  complete: 'success',
  error: 'danger',
};

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
  return (
    <View style={styles.panel}>
      <Text style={styles.phase} allowFontScaling>
        {phaseLabel}
      </Text>

      <ProgressBar percent={percent} tone={TONES[variant]} label={phaseLabel} />

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

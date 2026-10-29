/**
 * The one progress bar.
 *
 * Rows in the queue and the single-job panel draw the same shape, so the bar
 * lives here instead of being copied into both: same height, same radius, same
 * accessibility value, one place to fix. The colour is a tone, not a variant, so
 * a row can say "failed" and the panel can say "complete" without either knowing
 * about the other's states.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { color, radius } from '../tokens';

export type ProgressTone = 'accent' | 'success' | 'danger';

export interface ProgressBarProps {
  /** Whole percent, or `null` when the duration is unknown. */
  readonly percent: number | null;
  readonly tone: ProgressTone;
  /** Read out by TalkBack in place of the bar's own drawing. */
  readonly label: string;
}

const TONES: Record<ProgressTone, string> = {
  accent: color.accent,
  success: color.success,
  danger: color.danger,
};

export function ProgressBar({ percent, tone, label }: ProgressBarProps): React.JSX.Element {
  const width = percent === null ? 100 : Math.max(0, Math.min(100, percent));

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={
        percent === null ? { text: 'Working' } : { min: 0, max: 100, now: Math.round(percent) }
      }
    >
      <View
        style={[
          styles.fill,
          { width: `${width}%`, backgroundColor: TONES[tone] },
          percent === null ? styles.indeterminate : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  indeterminate: {
    opacity: 0.5,
  },
});

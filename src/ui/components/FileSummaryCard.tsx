import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaSummary } from '../../domain/probe';
import { formatBytes, metadataLine } from '../format';
import { color, radius, spacing, type, weight } from '../tokens';

export type FileSummaryState = 'empty' | 'probing' | 'ready' | 'unsupported';

export interface FileSummaryCardProps {
  state: FileSummaryState;
  name?: string | null;
  sizeBytes?: number | null;
  summary?: MediaSummary | null;
  /** Why the file cannot be used, shown with a danger border. */
  reason?: string | null;
}

/**
 * Source file summary. Four states, one component (design system):
 * empty, probing, ready, unsupported.
 */
export function FileSummaryCard({
  state,
  name,
  sizeBytes,
  summary,
  reason,
}: FileSummaryCardProps): React.JSX.Element {
  const size = formatBytes(sizeBytes);
  const details = metadataLine([
    size,
    summary?.durationLabel ?? null,
    summary?.videoCodec ?? null,
    summary?.audioCodec ?? null,
  ]);

  return (
    <View
      style={[styles.card, state === 'unsupported' ? styles.unsupported : null]}
      accessibilityRole="summary"
    >
      {state === 'empty' ? (
        <>
          <Text style={styles.emptyTitle} allowFontScaling>
            No file chosen
          </Text>
          <Text style={styles.emptyBody} allowFontScaling>
            Choose a video to convert. It stays on this device.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.name} numberOfLines={2} allowFontScaling>
            {name ?? 'Selected file'}
          </Text>
          {state === 'probing' ? (
            <Text style={styles.meta} allowFontScaling>
              Reading the file…
            </Text>
          ) : null}
          {state === 'ready' ? (
            <Text style={styles.meta} allowFontScaling>
              {details.length > 0 ? details : 'Ready'}
            </Text>
          ) : null}
          {state === 'unsupported' && reason ? (
            <Text style={styles.reason} allowFontScaling>
              {reason}
            </Text>
          ) : null}
        </>
      )}
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
  },
  unsupported: {
    borderColor: color.danger,
  },
  name: {
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
    fontWeight: weight.title,
    color: color.textPrimary,
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textSecondary,
  },
  reason: {
    marginTop: spacing.sm,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.danger,
  },
  emptyTitle: {
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
    fontWeight: weight.title,
    color: color.textPrimary,
  },
  emptyBody: {
    marginTop: spacing.xs,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.textSecondary,
  },
});

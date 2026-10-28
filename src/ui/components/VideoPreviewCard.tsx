import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { MediaSummary } from '../../domain/probe';
import { containerLabel, extensionLabel, formatBytes, metadataLine, resolutionLabel } from '../format';
import { color, radius, spacing, type, weight } from '../tokens';

export type PreviewState = 'empty' | 'probing' | 'ready' | 'unsupported';

export interface VideoPreviewCardProps {
  state: PreviewState;
  name?: string | null;
  sizeBytes?: number | null;
  summary?: MediaSummary | null;
  /** Why the file cannot be used, shown with a danger border. */
  reason?: string | null;
}

/**
 * The preview area: a 16:9 frame plus the source file's name and metadata.
 *
 * One component, four states (design system): empty, probing, ready,
 * unsupported. No frame is decoded, so the frame carries a decorative play
 * glyph and the text below it carries all of the meaning.
 */
export function VideoPreviewCard({
  state,
  name,
  sizeBytes,
  summary,
  reason,
}: VideoPreviewCardProps): React.JSX.Element {
  const details = metadataLine([
    formatBytes(sizeBytes),
    summary?.durationLabel ?? null,
    resolutionLabel(summary?.width, summary?.height),
    extensionLabel(name) ?? containerLabel(summary?.container),
    summary?.videoCodec ?? null,
    summary?.audioCodec ?? null,
  ]);

  const description =
    state === 'empty'
      ? 'No video selected'
      : state === 'probing'
        ? `${name ?? 'Selected video'}, reading the file`
        : state === 'unsupported'
          ? `${name ?? 'Selected video'}. ${reason ?? 'This file cannot be converted.'}`
          : `${name ?? 'Selected video'}. ${details.length > 0 ? details : 'Ready to convert'}`;

  return (
    <View
      style={[styles.card, state === 'unsupported' ? styles.cardUnsupported : null]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={description}
    >
      <View style={[styles.frame, state === 'empty' ? styles.frameEmpty : null]}>
        {state === 'probing' ? (
          <ActivityIndicator color={color.accent} />
        ) : (
          <View
            style={[styles.glyphCircle, state === 'unsupported' ? styles.glyphCircleUnsupported : null]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[styles.glyph, state === 'unsupported' ? styles.glyphUnsupported : null]}>
              {state === 'unsupported' ? '!' : '▶'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        {state === 'empty' ? (
          <>
            <Text style={styles.name} allowFontScaling>
              No video selected
            </Text>
            <Text style={styles.body} allowFontScaling>
              The preview of your video appears here. It stays on this device.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.name} numberOfLines={2} allowFontScaling>
              {name ?? 'Selected video'}
            </Text>
            {state === 'probing' ? (
              <Text style={styles.meta} allowFontScaling>
                Reading the video…
              </Text>
            ) : null}
            {state === 'ready' ? (
              <Text style={styles.meta} allowFontScaling>
                {details.length > 0 ? details : 'Ready to convert'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    padding: spacing.sm,
    gap: spacing.md,
  },
  cardUnsupported: {
    borderColor: color.danger,
  },
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.control,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
  },
  glyphCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphCircleUnsupported: {
    borderColor: color.danger,
  },
  glyph: {
    // Optical centring: the play triangle's own bearing is not symmetric.
    marginLeft: spacing.xs,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    color: color.accent,
  },
  glyphUnsupported: {
    marginLeft: 0,
    color: color.danger,
    fontWeight: weight.title,
  },
  footer: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  name: {
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
    fontWeight: weight.title,
    color: color.textPrimary,
  },
  body: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.textSecondary,
  },
  meta: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textSecondary,
  },
  reason: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.danger,
  },
});

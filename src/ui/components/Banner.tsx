import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, spacing, touchTarget, type, weight } from '../tokens';

export type BannerVariant = 'error' | 'warning' | 'info' | 'success';

export interface BannerProps {
  variant: BannerVariant;
  title: string;
  message: string;
  /** What to do next; never omitted for an error. */
  recovery?: string;
  /** Raw engine text, kept behind an expander (TR-30). */
  detail?: string;
}

const ACCENTS: Record<BannerVariant, string> = {
  error: color.danger,
  warning: color.warning,
  info: color.accent,
  success: color.success,
};

/** Inline message above the primary action, with an optional Details expander. */
export function Banner({ variant, title, message, recovery, detail }: BannerProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.banner, { borderLeftColor: ACCENTS[variant] }]}>
      <Text style={[styles.title, { color: ACCENTS[variant] }]} allowFontScaling>
        {title}
      </Text>
      <Text style={styles.message} allowFontScaling>
        {message}
      </Text>
      {recovery ? (
        <Text style={styles.recovery} allowFontScaling>
          {recovery}
        </Text>
      ) : null}

      {detail ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'Hide details' : 'Show details'}
            onPress={() => setExpanded((value) => !value)}
            style={styles.detailsToggle}
          >
            <Text style={styles.detailsLabel} allowFontScaling>
              {expanded ? 'Hide details' : 'Details'}
            </Text>
          </Pressable>
          {expanded ? (
            <Text style={styles.detail} allowFontScaling>
              {detail}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    borderLeftWidth: 4,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: weight.title,
  },
  message: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.textPrimary,
  },
  recovery: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.textSecondary,
  },
  detailsToggle: {
    minHeight: touchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  detailsLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: weight.label,
    color: color.accent,
  },
  detail: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
});

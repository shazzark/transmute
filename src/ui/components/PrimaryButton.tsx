import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, spacing, touchTarget, type, weight } from '../tokens';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shown under the button when it is disabled, so the reason is never hidden. */
  disabledReason?: string;
  loading?: boolean;
  accessibilityLabel?: string;
}

/** The one commitment action on a screen. Dark ink on the accent fill (AA). */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  disabledReason,
  loading = false,
  accessibilityLabel,
}: PrimaryButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        disabled={isDisabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          pressed && !isDisabled ? styles.pressed : null,
          isDisabled ? styles.disabled : null,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={color.accentInk} />
        ) : (
          <Text style={styles.label} allowFontScaling>
            {label}
          </Text>
        )}
      </Pressable>
      {disabled && disabledReason ? (
        <Text style={styles.reason} allowFontScaling>
          {disabledReason}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    borderRadius: radius.control,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    backgroundColor: color.surfaceRaised,
  },
  label: {
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
    fontWeight: weight.title,
    color: color.accentInk,
  },
  reason: {
    marginTop: spacing.sm,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
    textAlign: 'center',
  },
});

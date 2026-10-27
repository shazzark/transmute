import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { color, radius, spacing, touchTarget, type, weight } from '../tokens';

export interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Renders the label in the danger colour for destructive actions. */
  destructive?: boolean;
  accessibilityLabel?: string;
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  destructive = false,
  accessibilityLabel,
}: SecondaryButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && !disabled ? styles.pressed : null]}
    >
      <Text
        style={[styles.label, destructive ? styles.destructiveLabel : null, disabled && styles.disabledLabel]}
        allowFontScaling
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: {
    backgroundColor: color.surfaceRaised,
  },
  label: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: weight.label,
    color: color.textPrimary,
  },
  destructiveLabel: {
    color: color.danger,
  },
  disabledLabel: {
    color: color.textSecondary,
  },
});

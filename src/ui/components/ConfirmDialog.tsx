import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, spacing, type, weight } from '../tokens';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  /** One sentence about the consequence. */
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

/** Destructive confirmation: cancel first in reading order, confirm last (TR-20). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onCancel}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title} allowFontScaling>
            {title}
          </Text>
          <Text style={styles.message} allowFontScaling>
            {message}
          </Text>
          <View style={styles.actions}>
            <SecondaryButton label={cancelLabel} onPress={onCancel} />
            {destructive ? (
              <SecondaryButton label={confirmLabel} onPress={onConfirm} destructive />
            ) : (
              <PrimaryButton label={confirmLabel} onPress={onConfirm} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: weight.title,
    color: color.textPrimary,
  },
  message: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  isSaving,
  savedLocation,
  targetLabel,
  type SaveState,
  type SaveTarget,
} from '../../domain/saveIntent';
import { Banner } from './Banner';
import { SecondaryButton } from './SecondaryButton';
import { color, spacing, type, weight } from '../tokens';

export interface SavePanelProps {
  readonly state: SaveState;
  readonly onSavePhotos: () => void;
  readonly onSaveFolder: () => void;
}

/** The two destinations, in the order they are offered. */
const TARGETS: readonly SaveTarget[] = ['photos', 'folder'];

/**
 * Gets the finished file out of the app cache.
 *
 * Both destinations are always offered, because either can be refused: a
 * library that will not take the file does not mean the folder will not. A
 * landed copy is stated per destination and never inferred, so saving to a
 * folder does not make the screen claim the file is in Photos (TR-30).
 */
export function SavePanel({ state, onSavePhotos, onSaveFolder }: SavePanelProps): React.JSX.Element {
  const saving = isSaving(state);
  const handlers: Record<SaveTarget, () => void> = {
    photos: onSavePhotos,
    folder: onSaveFolder,
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.label} allowFontScaling accessibilityRole="header">
        Keep a copy
      </Text>

      {TARGETS.map((target) => {
        const location = savedLocation(state, target);
        const active = saving && state.target === target;

        return (
          <View key={target} style={styles.action}>
            <SecondaryButton
              label={
                active ? `Saving to ${targetLabel(target)}…` : `Save to ${targetLabel(target)}`
              }
              onPress={handlers[target]}
              disabled={saving}
              accessibilityLabel={`Save the converted file to ${targetLabel(target)}`}
            />
            {location !== null ? (
              <Text style={styles.saved} allowFontScaling>
                Saved to {location}
              </Text>
            ) : null}
          </View>
        );
      })}

      {state.status === 'failed' && state.failure ? (
        <Banner
          variant="error"
          title={state.failure.title}
          message={state.failure.message}
          recovery={state.failure.recovery}
          {...(state.failure.detail ? { detail: state.failure.detail } : {})}
        />
      ) : (
        <Text style={styles.note} allowFontScaling>
          Saving copies the finished file out of the app cache. The conversion is already
          done, so a refused copy never loses it.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
  },
  label: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  action: {
    gap: spacing.xs,
  },
  saved: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    fontWeight: weight.label,
    color: color.success,
  },
  note: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
});

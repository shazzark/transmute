import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  isSaving,
  saveTargets,
  savedLocation,
  targetLabel,
  type SaveFileKind,
  type SaveState,
  type SaveTarget,
} from '../../domain/saveIntent';
import { Banner } from './Banner';
import { SecondaryButton } from './SecondaryButton';
import { color, spacing, type, weight } from '../tokens';

export interface SavePanelProps {
  readonly state: SaveState;
  /**
   * What is being copied out. Media goes to Photos or a folder; a subtitle file
   * has no place in the photo library, so only the folder is offered.
   */
  readonly kind?: SaveFileKind;
  readonly onSave: (target: SaveTarget) => void;
}

/** The sentence under the buttons, which differs by what is being copied. */
const NOTES: Record<SaveFileKind, string> = {
  media:
    'Saving copies the finished file out of the app cache. The conversion is already done, so a refused copy never loses it.',
  subtitle:
    'Saving writes the subtitle file into the folder you pick. Choose Downloads or Documents to find it in your files app.',
};

const FILE_LABELS: Record<SaveFileKind, string> = {
  media: 'converted file',
  subtitle: 'subtitle file',
};

/**
 * Gets a finished file out of the app cache.
 *
 * Every destination the kind of file can go to is offered, because any of them
 * can be refused. A landed copy is stated per destination and never inferred, so
 * saving to a folder does not make the screen claim the file is in Photos
 * (TR-30).
 */
export function SavePanel({ state, kind = 'media', onSave }: SavePanelProps): React.JSX.Element {
  const saving = isSaving(state);

  return (
    <View style={styles.panel}>
      <Text style={styles.label} allowFontScaling accessibilityRole="header">
        Keep a copy
      </Text>

      {saveTargets(kind).map((target) => {
        const location = savedLocation(state, target);
        const active = saving && state.target === target;

        return (
          <View key={target} style={styles.action}>
            <SecondaryButton
              label={
                active ? `Saving to ${targetLabel(target)}…` : `Save to ${targetLabel(target)}`
              }
              onPress={() => onSave(target)}
              disabled={saving}
              accessibilityLabel={`Save the ${FILE_LABELS[kind]} to ${targetLabel(target)}`}
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
          {NOTES[kind]}
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

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRESETS, type Preset, type PresetId } from '../../domain/presets';
import { color, radius, spacing, touchTarget, type, weight } from '../tokens';

export interface PresetSelectorProps {
  selectedId: PresetId;
  onSelect: (id: PresetId) => void;
  disabled?: boolean;
}

/** A row of chips. Unavailable presets stay visible and say why. */
export function PresetSelector({
  selectedId,
  onSelect,
  disabled = false,
}: PresetSelectorProps): React.JSX.Element {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {PRESETS.map((preset) => (
        <PresetChip
          key={preset.id}
          preset={preset}
          selected={preset.id === selectedId}
          disabled={disabled || !preset.available}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

interface PresetChipProps {
  preset: Preset;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: PresetId) => void;
}

function PresetChip({ preset, selected, disabled, onSelect }: PresetChipProps): React.JSX.Element {
  const label = preset.available ? preset.label : `${preset.label} — ${preset.unavailableReason}`;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onSelect(preset.id)}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : null,
        pressed && !disabled ? styles.chipPressed : null,
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          selected ? styles.chipLabelSelected : null,
          disabled ? styles.chipLabelDisabled : null,
        ]}
        allowFontScaling
      >
        {preset.label}
      </Text>
      {!preset.available ? (
        <Text style={styles.chipNote} allowFontScaling>
          {preset.unavailableReason}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    borderColor: color.accent,
    backgroundColor: color.surfaceRaised,
  },
  chipPressed: {
    backgroundColor: color.surfaceRaised,
  },
  chipLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: weight.label,
    color: color.textPrimary,
  },
  chipLabelSelected: {
    color: color.accent,
  },
  chipLabelDisabled: {
    color: color.textSecondary,
  },
  chipNote: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
});

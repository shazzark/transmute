import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRESETS, type Preset, type PresetId } from '../../domain/presets';
import { color, radius, spacing, touchTarget, type, weight } from '../tokens';

export interface PresetSelectorProps {
  selectedId: PresetId;
  onSelect: (id: PresetId) => void;
  disabled?: boolean;
}

/**
 * The output-format grid: every preset stays visible so the matrix never
 * changes shape. A preset that cannot run yet is disabled and says so in words;
 * selection is also shown with a check mark, never by colour alone (TR-20).
 */
export function PresetSelector({
  selectedId,
  onSelect,
  disabled = false,
}: PresetSelectorProps): React.JSX.Element {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {PRESETS.map((preset) => (
        <PresetTile
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

interface PresetTileProps {
  preset: Preset;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: PresetId) => void;
}

function PresetTile({ preset, selected, disabled, onSelect }: PresetTileProps): React.JSX.Element {
  const accessibilityLabel = preset.available
    ? `${preset.label}, ${preset.detail}`
    : `${preset.label}, ${preset.detail}. ${preset.unavailableReason}`;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onSelect(preset.id)}
      style={({ pressed }) => [
        styles.tile,
        selected ? styles.tileSelected : null,
        pressed && !disabled ? styles.tilePressed : null,
      ]}
    >
      <View style={styles.tileHeader}>
        <Text
          style={[
            styles.tileLabel,
            selected ? styles.tileLabelSelected : null,
            disabled ? styles.tileLabelDisabled : null,
          ]}
          allowFontScaling
        >
          {preset.label}
        </Text>
        {selected ? (
          <Text
            style={styles.check}
            allowFontScaling
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            ✓
          </Text>
        ) : null}
      </View>
      <Text style={styles.tileDetail} allowFontScaling>
        {preset.detail}
      </Text>
      {!preset.available ? (
        <Text style={styles.tileNote} allowFontScaling>
          {preset.unavailableReason}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
    minHeight: touchTarget,
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  tileSelected: {
    borderColor: color.accent,
    backgroundColor: color.surfaceRaised,
  },
  tilePressed: {
    backgroundColor: color.surfaceRaised,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  tileLabel: {
    flexShrink: 1,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
    fontWeight: weight.title,
    color: color.textPrimary,
  },
  tileLabelSelected: {
    color: color.accent,
  },
  tileLabelDisabled: {
    color: color.textSecondary,
  },
  check: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.accent,
  },
  tileDetail: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
  tileNote: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.warning,
  },
});

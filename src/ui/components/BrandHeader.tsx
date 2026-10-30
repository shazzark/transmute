import { StyleSheet, Text, View } from 'react-native';

import { color, radius, spacing, type } from '../tokens';

/** A small, native mark that echoes a media frame changing into a new format. */
export function BrandMark() {
  return (
    <View accessible={false} style={styles.mark}>
      <View style={styles.frame}>
        <View style={styles.play} />
      </View>
      <View style={styles.transform} />
    </View>
  );
}

export function BrandHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        <BrandMark />
        <View style={styles.copy}>
          <Text style={styles.wordmark} accessibilityRole="header" allowFontScaling>
            Transmute
          </Text>
          <Text style={styles.caption} allowFontScaling>
            Video conversion, on your device
          </Text>
        </View>
      </View>
      <View style={styles.privacyPill}>
        <View style={styles.statusDot} />
        <Text style={styles.privacyText} allowFontScaling>LOCAL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  copy: { flexShrink: 1, gap: spacing.xs },
  mark: {
    width: 48,
    height: 48,
    borderRadius: radius.card,
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 25,
    height: 19,
    borderWidth: 2,
    borderColor: color.accent,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: color.accent,
  },
  transform: {
    position: 'absolute',
    right: 7,
    bottom: 8,
    width: 8,
    height: 2,
    backgroundColor: color.success,
    transform: [{ rotate: '-35deg' }],
  },
  wordmark: {
    color: color.textPrimary,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  caption: { color: color.textSecondary, fontSize: type.caption.fontSize, lineHeight: type.caption.lineHeight },
  privacyPill: {
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: color.success },
  privacyText: { color: color.textSecondary, fontSize: type.caption.fontSize, lineHeight: type.caption.lineHeight, fontWeight: '600', letterSpacing: 0.8 },
});

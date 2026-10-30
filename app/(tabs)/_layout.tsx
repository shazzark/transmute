import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getQueueBadge, subscribeQueueBadge } from '../../src/ui/navigation/queueBadge';
import { color, spacing, type } from '../../src/ui/tokens';
import { useSyncExternalStore } from 'react';

const tabs = [
  { name: 'index', title: 'Home', icon: '⌂' },
  { name: 'convert', title: 'Convert', icon: '↻' },
  { name: 'queue', title: 'Queue', icon: '☷' },
  { name: 'results', title: 'Results', icon: '▤' },
  { name: 'settings', title: 'Settings', icon: '⚙' },
] as const;

/** The root conversion controller stays mounted while this navigator changes tabs. */
export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const pending = useSyncExternalStore(subscribeQueueBadge, getQueueBadge, getQueueBadge);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: [styles.bar, { height: 62 + insets.bottom, paddingBottom: Math.max(insets.bottom, spacing.xs) }],
        tabBarItemStyle: styles.item,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textSecondary,
        tabBarLabelStyle: styles.label,
        tabBarHideOnKeyboard: true,
      }}
    >
      {tabs.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            ...(name === 'queue' && pending > 0 ? {
              tabBarBadge: pending > 99 ? '99+' : pending,
              tabBarBadgeStyle: styles.badge,
            } : {}),
            tabBarIcon: ({ color: tint, focused }) => (
              <Text accessible={false} style={[styles.icon, { color: tint, opacity: focused ? 1 : 0.76 }]}>{icon}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: color.surface, borderTopColor: color.border,
    paddingTop: Platform.OS === 'android' ? 5 : spacing.xs,
  },
  item: { minHeight: 48 },
  icon: { fontSize: 21, lineHeight: 24 },
  label: { fontSize: type.caption.fontSize, lineHeight: 16, marginTop: -2 },
  badge: { backgroundColor: color.accent, color: color.accentInk, fontSize: 10, lineHeight: 14 },
});

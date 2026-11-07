import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, layout } from '../tokens';

/** Shared content frame with system insets, design spacing, and route-aware tab clearance. */
export function ScreenLayout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const hasTabBar = ['/', '/index', '/convert', '/queue', '/results', '/settings'].includes(pathname);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.frame,
        {
          top: insets.top,
          right: insets.right,
          bottom: (hasTabBar ? layout.tabBarHeight : 0) + insets.bottom,
          left: insets.left,
        },
      ]}
    >
      <View pointerEvents="box-none" style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute' },
  content: {
    flex: 1,
    backgroundColor: color.bg,
    paddingTop: layout.screenPadding,
    paddingHorizontal: layout.screenPadding,
  },
});

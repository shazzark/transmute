import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConversionScreen } from '../src/ui/screens/ConversionScreen';
import { color } from '../src/ui/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.inset}>
          {/* Keep the conversion controller mounted while the route changes. */}
          <View pointerEvents="box-none" style={styles.controller}>
            <ConversionScreen />
          </View>
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="activity" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="notices" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="results/[id]" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  inset: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) : 44,
  },
  controller: StyleSheet.absoluteFill,
});

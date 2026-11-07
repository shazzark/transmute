import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConversionScreen } from '../src/ui/screens/ConversionScreen';
import { color } from '../src/ui/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RootContent />
    </SafeAreaProvider>
  );
}

function RootContent() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.inset}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="activity" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notices" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="results/[id]" options={{ animation: 'slide_from_right' }} />
        </Stack>
        {/* Keep conversion state mounted above transparent route scenes; ScreenLayout bounds its content. */}
        <View pointerEvents="box-none" style={styles.controller}>
          <ConversionScreen />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  inset: { flex: 1 },
  controller: { ...StyleSheet.absoluteFill, zIndex: 1 },
});

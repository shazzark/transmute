import { StatusBar } from 'expo-status-bar';
import { Platform, StatusBar as ReactNativeStatusBar, StyleSheet, View } from 'react-native';

import { ConversionScreen } from './src/ui/screens/ConversionScreen';
import { color } from './src/ui/tokens';

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Insets are handled here rather than by a navigation library. */}
      <View style={styles.inset}>
        <ConversionScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
  inset: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (ReactNativeStatusBar.currentHeight ?? 0) : 44,
  },
});


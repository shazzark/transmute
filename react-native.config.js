const path = require('node:path');

const packageAndroidRoot = path.join(
  __dirname,
  'node_modules',
  'react-native-safe-area-context',
  'android'
);
const safeAreaCmakeLists = path.join(
  __dirname,
  'plugins',
  'cmake',
  'safe-area-context',
  'CMakeLists.txt'
);
const shortCmakeLists = (name) => path.join(
  __dirname,
  'plugins',
  'cmake',
  name,
  'CMakeLists.txt'
);

module.exports = {
  dependencies: {
    'react-native-safe-area-context': {
      platforms: {
        android: {
          cmakeListsPath: path.relative(packageAndroidRoot, safeAreaCmakeLists),
        },
      },
    },
    'react-native-gesture-handler': {
      platforms: {
        android: {
          cmakeListsPath: path.relative(packageAndroidRoot, shortCmakeLists('gesture-handler')),
        },
      },
    },
    'react-native-reanimated': {
      platforms: {
        android: {
          cmakeListsPath: path.relative(packageAndroidRoot, shortCmakeLists('reanimated')),
        },
      },
    },
  },
};

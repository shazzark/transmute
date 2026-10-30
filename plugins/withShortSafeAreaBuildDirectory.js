const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

const marker = '// Keep native codegen outputs under short project paths.';
const legacyMarker = '// Keep safe-area codegen sources under the short project root.';
const nativePoolMarker = '// Limit each CMake/Ninja project to one compile and link job.';
const appNativePoolMarker = '// Keep the app CMake/Ninja build within the one-job memory limit.';
const appNativePoolRule = `
${appNativePoolMarker}
android {
  defaultConfig {
    externalNativeBuild {
      cmake {
        arguments '-DCMAKE_JOB_POOLS=transmute_compile=1',
            '-DCMAKE_JOB_POOL_COMPILE=transmute_compile',
            '-DCMAKE_JOB_POOL_LINK=transmute_compile'
      }
    }
  }
}
`;
const buildDirectoryRule = `
${marker}
def shortNativeBuildDirectories = [
  ':react-native-safe-area-context': '../s',
  ':react-native-gesture-handler': '../g',
  ':react-native-reanimated': '../r'
]
subprojects { project ->
  def shortBuildDirectory = shortNativeBuildDirectories[project.path]
  if (shortBuildDirectory != null) {
    project.layout.buildDirectory.set(rootProject.file(shortBuildDirectory))
  }

  def configureNativeJobPool = {
    def android = project.extensions.findByName('android')
    if (android != null) {
      android.defaultConfig {
        externalNativeBuild {
          cmake {
            arguments '-DCMAKE_JOB_POOLS=transmute_compile=1',
                '-DCMAKE_JOB_POOL_COMPILE=transmute_compile',
                '-DCMAKE_JOB_POOL_LINK=transmute_compile'
          }
        }
      }
    }
  }

  project.plugins.withId('com.android.application') { configureNativeJobPool() }
  project.plugins.withId('com.android.library') { configureNativeJobPool() }
}
${nativePoolMarker}
`;

module.exports = function withShortSafeAreaBuildDirectory(config) {
  config = withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes(marker) || !contents.includes(nativePoolMarker)) {
      const currentRule = contents.indexOf(marker);
      const legacyRule = contents.indexOf(legacyMarker);
      const existingRule = [currentRule, legacyRule].filter((index) => index >= 0).sort((a, b) => a - b)[0];
      if (existingRule >= 0) {
        config.modResults.contents = contents.slice(0, existingRule).trimEnd();
      }
      config.modResults.contents = `${config.modResults.contents.trimEnd()}\n${buildDirectoryRule}`;
    }
    return config;
  });

  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes(appNativePoolMarker)) {
      config.modResults.contents = `${config.modResults.contents.trimEnd()}\n${appNativePoolRule}`;
    }
    return config;
  });
};

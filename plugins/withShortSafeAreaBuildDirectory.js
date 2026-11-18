const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

const marker = '// Keep native codegen outputs short and inside ignored android/ so JS bundling cannot scan them.';
const legacyMarker = '// Keep safe-area codegen sources under the short project root.';
const nativePoolMarker = '// Limit each CMake/Ninja project to one compile and link job.';
const appNativePoolMarker = '// Keep the app CMake/Ninja build within the one-job memory limit.';
const releaseBundleOrderMarker = '// Build release native code before Metro scans the generated tree.';
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
const releaseBundleOrderRule = `
${releaseBundleOrderMarker}
afterEvaluate {
  tasks.named('createBundleReleaseJsAndAssets') {
    dependsOn(
      ':react-native-gesture-handler:compileReleaseJavaWithJavac',
      ':react-native-gesture-handler:packageReleaseResources',
      ':react-native-gesture-handler:generateReleaseBuildConfig',
      ':react-native-gesture-handler:generateCodegenArtifactsFromSchema',
      ':react-native-gesture-handler:processReleaseNavigationResources',
      ':react-native-gesture-handler:configureCMakeRelWithDebInfo[armeabi-v7a]',
      ':react-native-gesture-handler:buildCMakeRelWithDebInfo[armeabi-v7a]',
      ':react-native-gesture-handler:mergeReleaseJniLibFolders',
      ':react-native-gesture-handler:copyReleaseJniLibsProjectOnly',
      ':react-native-gesture-handler:mergeReleaseNativeLibs',
      ':react-native-gesture-handler:compileReleaseKotlin',
      ':react-native-reanimated:compileReleaseJavaWithJavac',
      ':react-native-reanimated:packageReleaseResources',
      ':react-native-reanimated:generateReleaseBuildConfig',
      ':react-native-reanimated:generateCodegenArtifactsFromSchema',
      ':react-native-reanimated:copyReleaseJniLibsProjectOnly',
      ':react-native-reanimated:exportReleaseConsumerProguardFiles',
      ':react-native-reanimated:mergeReleaseJniLibFolders',
      ':react-native-reanimated:mergeReleaseNativeLibs',
      ':react-native-safe-area-context:compileReleaseJavaWithJavac',
      ':react-native-safe-area-context:compileReleaseKotlin',
      ':react-native-safe-area-context:copyReleaseJniLibsProjectOnly',
      ':react-native-safe-area-context:generateCodegenArtifactsFromSchema',
      ':react-native-safe-area-context:generateReleaseBuildConfig',
      ':react-native-safe-area-context:mergeReleaseJniLibFolders',
      ':react-native-safe-area-context:packageReleaseResources',
      ':react-native-safe-area-context:processReleaseNavigationResources'
    )
  }
}
`;
const buildDirectoryRule = `
${marker}
def shortNativeBuildDirectories = [
  ':react-native-safe-area-context': 's',
  ':react-native-gesture-handler': 'g'
]
// Reanimated's CMakeLists.txt hard-codes its generated code path to android/build.
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
    let contents = config.modResults.contents;
    if (!contents.includes(appNativePoolMarker)) {
      contents = `${contents.trimEnd()}\n${appNativePoolRule}`;
    }
    if (!contents.includes(releaseBundleOrderMarker)) {
      contents = `${contents.trimEnd()}\n${releaseBundleOrderRule}`;
    }
    config.modResults.contents = contents;
    return config;
  });
};

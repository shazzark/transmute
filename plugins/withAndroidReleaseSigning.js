const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Transmute release signing comes from local environment; never fall back to the debug key.';
const rule = `
${marker}
def transmuteReleaseStorePath = System.getenv('TRANSMUTE_RELEASE_STORE_FILE')
def transmuteReleaseStorePassword = System.getenv('TRANSMUTE_RELEASE_STORE_PASSWORD')
def transmuteReleaseKeyAlias = System.getenv('TRANSMUTE_RELEASE_KEY_ALIAS')
def transmuteReleaseKeyPassword = System.getenv('TRANSMUTE_RELEASE_KEY_PASSWORD')
def transmuteReleaseStoreFile = transmuteReleaseStorePath ? file(transmuteReleaseStorePath) : null
def transmuteReleaseSigningReady = transmuteReleaseStoreFile != null && transmuteReleaseStoreFile.isFile() &&
    transmuteReleaseStorePassword && transmuteReleaseKeyAlias && transmuteReleaseKeyPassword
def transmuteAppProject = project

gradle.taskGraph.whenReady { taskGraph ->
  def releaseTaskRequested = taskGraph.allTasks.any { task ->
    task.project == transmuteAppProject && task.name.toLowerCase().contains('release')
  }
  if (releaseTaskRequested && !transmuteReleaseSigningReady) {
    throw new GradleException('Release build refused: configure TRANSMUTE_RELEASE_STORE_FILE, TRANSMUTE_RELEASE_STORE_PASSWORD, TRANSMUTE_RELEASE_KEY_ALIAS, and TRANSMUTE_RELEASE_KEY_PASSWORD. No debug-key fallback is allowed.')
  }
}
`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (contents.includes(marker)) return config;

    const signingConfigs = '    signingConfigs {';
    const signingConfigsIndex = contents.indexOf(signingConfigs);
    if (signingConfigsIndex < 0) {
      throw new Error('Could not find the Android signingConfigs block while configuring release signing.');
    }
    contents = `${contents.slice(0, signingConfigsIndex)}${rule}\n${contents.slice(signingConfigsIndex)}`;

    const releaseSigningPattern = /signingConfig signingConfigs\.debug(?=\s*\n\s*def enableShrinkResources)/;
    if (!releaseSigningPattern.test(contents)) {
      throw new Error('Could not find the generated release debug-key assignment to replace.');
    }
    contents = contents.replace(
      releaseSigningPattern,
      "if (transmuteReleaseSigningReady) {\n                signingConfig signingConfigs.release\n            } else {\n                signingConfig null\n            }",
    );

    contents = contents.replace(
      /    signingConfigs \{\n        debug \{([\s\S]*?)\n        \}\n    \}/,
      (block, debugConfig) => `    signingConfigs {\n        debug {${debugConfig}\n        }\n        if (transmuteReleaseSigningReady) {\n            release {\n                storeFile transmuteReleaseStoreFile\n                storePassword transmuteReleaseStorePassword\n                keyAlias transmuteReleaseKeyAlias\n                keyPassword transmuteReleaseKeyPassword\n            }\n        }\n    }`,
    );
    if (!contents.includes('release {\n                storeFile transmuteReleaseStoreFile')) {
      throw new Error('Could not add the dedicated Android release signing configuration.');
    }

    const buildTypesIndex = contents.indexOf('    buildTypes {');
    const releaseBlockIndex = contents.indexOf('        release {', buildTypesIndex);
    const releaseBlockEnd = contents.indexOf('\n        }', releaseBlockIndex);
    if (buildTypesIndex < 0 || releaseBlockIndex < 0 || releaseBlockEnd < 0) {
      throw new Error('Could not verify the generated Android release build type.');
    }
    if (/signingConfig\s+signingConfigs\.debug/.test(contents.slice(releaseBlockIndex, releaseBlockEnd))) {
      throw new Error('Refusing to generate a release build that still selects the debug signing key.');
    }

    config.modResults.contents = contents;
    return config;
  });
};

/**
 * Release builds declare no network permission. (TR-13)
 *
 * Expo's bare template declares `android.permission.INTERNET` in the main
 * manifest, which every variant inherits, and the development client genuinely
 * needs it to reach Metro. Transmute's promise is that a conversion never touches
 * the network, so this plugin writes a release-only manifest whose
 * `tools:node="remove"` drops the permission during the release merge. Debug
 * builds keep it, so `npm run android` and the phone verification workflow still
 * work.
 *
 * Nothing in the app performs a request: the engine, the document picker, the
 * file system, and the media library all operate on local files, and
 * `expo.modules.updates.ENABLED` is false.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const RELEASE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- Debug keeps INTERNET for the Metro connection; a release build requests nothing. -->
    <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
</manifest>
`;

module.exports = function withReleaseNoInternet(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const releaseDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'release',
      );
      fs.mkdirSync(releaseDir, { recursive: true });
      fs.writeFileSync(path.join(releaseDir, 'AndroidManifest.xml'), RELEASE_MANIFEST, 'utf8');
      return config;
    },
  ]);
};

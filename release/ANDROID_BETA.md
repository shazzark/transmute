# Android beta release

**Release:** `v0.2.0-beta.1` (`dev.transmute.app`, version code 2)

**Distribution:** signed ARMv7 APK plus the matching native source bundle

**Signing:** verified against the owner-provided release keystore fingerprint

## Release gates

- [x] Signing certificate SHA-256 matches the release keystore: `1499d8f46061bcd589aac34bad7987c48bc3109dd923f9b128011ea2d965d662`.
- [x] Complete the offline native-runtime license set. giflib 5.2.1 COPYING (SHA-256 `0c9b7990ecdca88b676db232c226548ac408b279f550d424d996f0d83591dd8e`) was extracted from the 444187-byte Debian source archive (SHA-256 `31da5562f44c5f15d63340a09a4fd62b48c45620cd302f77a6d9acf0077879bd`); the extracted file matches the bundled text. The offline Settings route is scrollable, has back navigation, and its focused test passed (5 tests).
- [x] Refreshed native source bundle after adding the complete Android runtime license set; it includes `LICENSES/`, source archives, and FFmpeg/LGPL relinking instructions.
- [x] QA package `dev.transmute.app.qa` installed alongside the existing `dev.transmute.app`; no uninstall or data clearing was performed. Original app remained version `0.1.0` / code 1 (`firstInstallTime=2026-10-27 15:07:00`, `lastUpdateTime=2026-11-12 12:30:01`).
- [x] On the Galaxy A13 SM-A135F / Android 14, current-worktree JS converted the compatible 176×144 MP4 to a ready 1.5 MB GIF; in-app preview frames changed during playback.
- [x] The same 176×144 fixture converted to a ready 295 kB MP4 Result. Logcat and ActivityManager evidence show Transmute remained alive with no crash. Before the attempted Play action, `dumpsys activity` identified `ng.gov.pocacov.pocacov_citizen/.MainActivity` as top-resumed; the screen showed its registration/password form. That establishes another app was foregrounded at that check, with no evidence of a Transmute crash. No further device taps were sent.
- [x] On the Galaxy A13, played the ready `source-176.mp4` result in the QA package. Two screenshots showed the embedded player advancing from `00:01` to `00:02` with changed test-pattern frames; Logcat showed the 176×144 AVC decoder reaching end of stream. Transmute stayed top-resumed and its PID remained alive; no crash record was found.
- QA package evidence remains local under ignored `.local-recovery/`: debug APK SHA-256 `7f836a120c7e23f7fbcd4276efa961974a6995edecee44eac94bd627ff3ddeb7`. The QA APK was built from the native Android project at source base commit `addf4585bff543700cb8d40f20e84cd51115d004`; its JavaScript bundle was served from the modified, uncommitted worktree through Metro. The eventual signed distributable APK will be a separate release build with the same source edits compiled into it.
- [x] Automated source checks: `npm run typecheck`; `npm test` (34 files, 433 tests).
- [ ] Build and verify the final signed release APK and checksum.
- [ ] Publish the GitHub prerelease, APK, checksum and source bundle; then update and push the website asset URLs and verify Vercel and downloaded checksum.

## Native licenses and source

The APK packages `libNitroMunimFfmpeg.so` for `armeabi-v7a`; native components and source versions are listed in `THIRD_PARTY_NOTICES.md`. Full applicable texts, notices and patent terms are bundled in the app and available offline from **Settings → Third-party notices and licenses**. The screen scrolls through the texts and provides back navigation. `LICENSES/README.md` records source URLs and version provenance. The public app source revision and native source bundle accompany the APK; see `release/NATIVE_SOURCE_BUNDLE.md` for the v0.9.2 source tag and its stale upstream `build-info.txt` header note.

The final app must retain those source-distribution and replacement/relinking materials beside the APK. Do not include local signing credentials or QA evidence in Git or the public source archive.

## APK verification record

Complete after the final release build:

- Artifact: `transmute-v0.2.0-beta.1-armv7.apk`
- Package/version: `dev.transmute.app`, `0.2.0-beta.1`, version code 2
- Minimum Android: 7.0 (API 24)
- ABI: `armeabi-v7a` only
- APK Signature Scheme v2 and certificate SHA-256: verify against the fingerprint above
- APK SHA-256 and byte size: record from the final file and checksum sidecar
- Source revision: record the commit used for the final public application source

Use `scripts/build-android.ps1 -PrebuildOnly` to regenerate and version-check the native project. The script backs up generated sources, signing material, and prior APK outputs under ignored `.local-recovery/`. Then run `scripts/build-android.ps1 -Release -SkipPrebuild`; it prompts locally for the dedicated keystore, alias and passwords. Do not place passwords in a command line, environment file, chat, or Git.

## Tester installation

Download the APK and `.sha256` file from the GitHub prerelease and verify the APK SHA-256 before installation. Allow installation for the browser or file manager that opened the APK, then confirm the Android package installer. The release package is signed with the verified upload key. Keep the existing Transmute installation and its data; the separate QA package was used for device testing.

## Known beta limitations

- Only 32-bit ARMv7 (`armeabi-v7a`) is included; ARM64-only and x86 devices are unsupported by this APK.
- Device acceptance covered one Samsung Galaxy A13 on Android 14. Android 7+ is the configured minimum, not a broad device-compatibility claim.
- The tested A13 hardware encoder rejects 160×144 input for MP4 and requires at least 176×144; the supplied 176×144 fixture succeeds.
- OGG/Vorbis encoding is unavailable because this build does not include `libvorbis`.
- In tests on this device, embedded subtitle tracks in MOV and WebM were not exposed by the Android playback stack.
- MP4 playback and GIF animated playback passed in the QA package loaded from the current worktree through Metro. Final release APK verification and post-install phone recheck remain pending.
- Active conversion cancellation/failure cleanup, a second-device acceptance run and a comprehensive accessibility review remain outstanding.

## Release notes

Transmute converts video and extracts audio locally on Android. This beta includes video conversion to MP4, MKV, MOV, WebM and animated GIF; audio extraction; subtitle tools; local conversion history and Results; and offline third-party notices.

The beta is for testing. It supports ARMv7 devices running Android 7.0 or later, subject to device codec capabilities. See the known limitations and verify the published APK checksum before installing. The APK is distributed with the matching native source bundle and notices.

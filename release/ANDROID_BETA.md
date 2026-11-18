# Android beta preparation (draft)

**Release target:** `v0.2.0-beta.1` (Android version name `0.2.0-beta.1`, version code 2)
**State:** Not ready to publish. This is a release checklist and draft notes, not an APK or a claim that every acceptance gate passed.

## Verified local artifact (2026-11-18)

- Path: `android/app/build/outputs/apk/release/app-release.apk`
- Package/version: `dev.transmute.app`, `0.2.0-beta.1`, version code `2`
- Size: `60,121,689` bytes
- ABI: `armeabi-v7a` only
- APK Signature Scheme v2: valid; signer certificate SHA-256: `1499d8f46061bcd589aac34bad7987c48bc3109dd923f9b128011ea2d965d662`
- APK SHA-256: `1a2cd970c48f5bfc48f9b1ad290c1df807b2d3921fa8025b79e2b9810c96416c`

This certificate differs from the A13's installed debug certificate (`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`). Do not install this package over that app. The dedicated keystore was not accessible in this workspace to independently compare its public certificate with the APK signer, so the dedicated-key match remains unverified. Keep the checksum sidecar and device QA evidence under ignored `.local-recovery/`.

For A13 QA, a separate `dev.transmute.app.qa` APK was built with the Android debug key and installed side by side. It launched on the SM-A135F / Android 14 device. The original `dev.transmute.app` remains version `0.1.0` / code 1 with `firstInstallTime=2026-10-27 15:07:00` and `lastUpdateTime=2026-11-12 12:30:01`. QA APK, screenshot, UI hierarchy and build transcript are local-only under ignored `.local-recovery/`; the QA package is not a release artifact. This is launch smoke evidence, not a completed conversion acceptance pass.

## Draft release notes

Transmute is an offline Android media converter. This beta adds/contains:

- Video to animated GIF with clip start/end, output width, frame rate, preserved aspect ratio, and silent output.
- SQLite-backed local history and app-owned Results storage.
- Optional embedded subtitle carry-through into supported video output conversions; use Captions in Results when the Android player exposes tracks.
- In-app preview of extracted SRT and VTT files.
- Save to Phone and Share as separate actions.

Verified on a Samsung Galaxy A13 (SM-A135F, Android 14): GIF conversion, 72-frame animation, in-app playback after offline relaunch, Save to Phone and Share chooser; embedded SRT-to-MP4 caption playback over moving video; MKV caption track selection; and direct SRT/VTT preview evidence recorded in `tasks.md`.

Known limits: the tested MOV and WebM subtitle tracks are not exposed by this device's player; OGG/Vorbis is unavailable; active conversion cancellation/failure cleanup, second-device acceptance, and full accessibility review remain open. The native inventory identifies LGPLv3 FFmpeg statically linked into `libmunimffmpeg.so` plus the libraries listed in `THIRD_PARTY_NOTICES.md`; however, the app's Notices route renders no content, so the in-app notice/relink presentation is not ready for distribution. Only ARMv7 is in this APK; do not claim other ABIs as beta-tested. This is not a production release.

Download: `transmute-v0.2.0-beta.1-armv7.apk` (60,121,689 bytes; Android 7.0+; `armeabi-v7a` only).

SHA-256: `1a2cd970c48f5bfc48f9b1ad290c1df807b2d3921fa8025b79e2b9810c96416c` (also attach `transmute-v0.2.0-beta.1-armv7.apk.sha256`).

Install: download the APK and checksum file, verify SHA-256, allow installs for the browser or file manager that opened the APK, then tap the APK and confirm. This package cannot update a debug-signed `dev.transmute.app` install without removing that app and its private data. Use a separate test package or a device without existing Transmute data.

## Signing gate

The current installed APK uses the local Android debug/test certificate and must not be uploaded to testers. Keep the dedicated upload keystore outside the repository. If it does not exist, create it in the user profile with PowerShell; `keytool` prompts for passwords, so do not add password arguments:

```powershell
$env:JAVA_HOME = Join-Path $env:USERPROFILE '.gradle\jdks\eclipse_adoptium-17-amd64-windows.2'
$keystorePath = Join-Path $env:USERPROFILE 'transmute-upload.jks'
& (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -v -keystore $keystorePath -alias transmute-upload -keyalg RSA -keysize 4096 -validity 10000
```

The command is also valid with `keytool` on `PATH`; at its key-password prompt, press Enter to use the keystore password. Never paste passwords into chat or commit them.

Use `scripts/build-android.ps1 -PrebuildOnly` to regenerate Android from Expo config. The script backs up generated native sources, local signing material, and previous APK outputs under `.local-recovery/`, then verifies the generated `versionName` and `versionCode` against `app.json`. Build only after that check succeeds with `scripts/build-android.ps1 -Release -SkipPrebuild`. It prompts locally for the keystore path, alias, and passwords, passes them to Gradle through process-only environment variables, and clears them from its process environment afterward. The Expo config plugin signs release builds only with those credentials; `assembleRelease` fails before task execution if any credential is missing or the keystore path is invalid. There is no debug-key fallback.

The beta artifact is ARMv7 only (`armeabi-v7a`) for the verified Galaxy A13 target. Record `Get-FileHash android\app\build\outputs\apk\release\app-release.apk -Algorithm SHA256`, verify the APK signature and certificate against the dedicated keystore, and inspect its native library entries before sharing. Do not install it over the existing A13 until checking its certificate: a different signing key cannot update the current package in place without uninstalling and losing app data. If the key differs, use a second device or a separate QA package ID for testing. Do not publish this draft until those checks and the remaining release gates have explicit dispositions.

## GitHub Release upload steps

After the signing-key match, notice-screen correction, and device QA gates are resolved:

1. In GitHub, open **Releases → Draft a new release** for `shazzark/transmute`.
2. Create/select tag `v0.2.0-beta.1` on the reviewed beta-preparation commit and use the title **Transmute Android beta 0.2.0-beta.1**.
3. Paste the draft release notes above, attach `transmute-v0.2.0-beta.1-armv7.apk` and a SHA-256 checksum file, and keep the release in draft until signing, license-notice, and device checks pass.
4. Verify the published APK asset resolves at the prepared URL in `website/index.html`, and verify the release-notes link opens the published `v0.2.0-beta.1` page.
5. After the release gates pass and a downloadable asset exists, update the website availability message and exact asset link. Deploy `website/` through the Transmute Vercel project with Root Directory `website`, Framework Preset `Other`, blank Build Command, Output Directory `.`, and no environment variables. Verify the production URL and asset link at mobile and desktop sizes.
6. Share that verified Pages URL with testers. Do not send a debug-signed APK or link to a draft release.

## Draft installation instructions

Download `transmute-v0.2.0-beta.1-armv7.apk` and verify its SHA-256 against the release checksum file before installing. On Android, allow installs for the browser or file manager that opened the APK, then tap the downloaded file and confirm installation. This package cannot update the currently installed debug-signed `dev.transmute.app` on the A13; doing so would require uninstalling the existing app and would delete its private data. Test only with a separately identified package build or a device without existing Transmute data. Re-enable the install restriction after setup if desired.

## Second-device checklist (pending)

- Install the signed APK over an existing test install, then cold-launch it.
- Convert a short local video to GIF; confirm motion in Results, save a copy, and open Share without sending.
- Convert a video with embedded SRT to MP4/MKV and confirm the caption track can be selected and displayed.
- Disable network access, force-stop, relaunch, and reopen the GIF and subtitle Result.
- Confirm Results and exported files from before the install are still present.
- Record model, Android version, ABI, APK SHA-256, and each outcome in `tasks.md`.

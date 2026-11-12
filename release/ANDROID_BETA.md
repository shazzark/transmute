# Android beta preparation (draft)

**Release target:** `v0.2.0-beta.1` (Android version name `0.2.0-beta.1`, version code 2)
**State:** Not ready to publish. This is a release checklist and draft notes, not an APK or a claim that every acceptance gate passed.

## Draft release notes

Transmute is an offline Android media converter. This beta adds/contains:

- Video to animated GIF with clip start/end, output width, frame rate, preserved aspect ratio, and silent output.
- SQLite-backed local history and app-owned Results storage.
- Optional embedded subtitle carry-through into supported video output conversions; use Captions in Results when the Android player exposes tracks.
- In-app preview of extracted SRT and VTT files.
- Save to Phone and Share as separate actions.

Verified on a Samsung Galaxy A13 (SM-A135F, Android 14): GIF conversion, 72-frame animation, in-app playback after offline relaunch, Save to Phone and Share chooser; embedded SRT-to-MP4 caption playback over moving video; MKV caption track selection; and direct SRT/VTT preview evidence recorded in `tasks.md`.

Known limits: the tested MOV and WebM subtitle tracks are not exposed by this device's player; OGG/Vorbis is unavailable; active conversion cancellation/failure cleanup, second-device acceptance, full accessibility review, and full native-library license audit are still open. This is not a production release. Only the ARMv7 ABI has been rebuilt and verified on the A13; do not claim the other available package ABIs as beta-tested.

## Signing gate

The current APK uses the local Android debug/test certificate and must not be uploaded to testers. A dedicated upload keystore is needed. Create and keep it outside Git, then provide its local path and alias using a secure local channel; never paste the keystore password into chat or commit it. Once available, configure the release build to use that key, build version code 2, verify the APK signature/certificate, install with `adb install -r`, and repeat conversion plus Results playback checks. Do not publish this draft until those steps and the remaining release gates have explicit dispositions.

## GitHub Release upload steps

After a verified, dedicated-key-signed APK exists:

1. In GitHub, open **Releases → Draft a new release** for `shazzark/transmute`.
2. Create/select tag `v0.2.0-beta.1` on the reviewed beta-preparation commit and use the title **Transmute Android beta 0.2.0-beta.1**.
3. Paste the draft release notes above, attach `transmute-v0.2.0-beta.1-armv7.apk`, and publish only after signing and device checks pass.
4. Copy the published APK asset link. In `website/index.html`, replace the “Android beta not available yet” state with a download link to that exact asset and update the release-notes link.
5. Commit the website link update and push it when separately authorized. GitHub Actions deploys `website/` through **Settings → Pages → Build and deployment → Source: GitHub Actions**. Check the **Deploy Transmute website** workflow result, open its reported Pages URL at mobile and desktop sizes, and verify the beta link.
6. Share that verified Pages URL with testers. Do not send a debug-signed APK or link to a draft release.

## Second-device checklist (pending)

- Install the signed APK over an existing test install, then cold-launch it.
- Convert a short local video to GIF; confirm motion in Results, save a copy, and open Share without sending.
- Convert a video with embedded SRT to MP4/MKV and confirm the caption track can be selected and displayed.
- Disable network access, force-stop, relaunch, and reopen the GIF and subtitle Result.
- Confirm Results and exported files from before the install are still present.
- Record model, Android version, ABI, APK SHA-256, and each outcome in `tasks.md`.

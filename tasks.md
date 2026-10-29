# Delivery tasks

> **Purpose:** Break Phase 1 of `implementation-plan.md` into small, checkable work items. **Related:** `implementation-plan.md` owns phase order and completion; `prd.md`/`trd.md` own requirements. This list does not replace requirements or approval.
>
> **Document rules:** `[Confirmed]`/`[Inferred]`/`[Recommended]`/`[Open question]` as defined in `project-brief.md`. T-01â€“T-13 are historical Phase 1 records; current cross-phase execution status is maintained below and in `implementation-plan.md`.

**Status:** Authorized execution through Phase 7; earlier phases have open evidence gaps | **Owner:** `shazzark` | **Updated:** 2026-10-29

## Current execution checklist

- [x] Reproduce and fix queue startup being blocked on notification permission.
- [x] Add rapid-start guard, notification destination validation, and interruption cleanup tests.
- [x] Configure Expo Router routes and keep the processing controller mounted above them.
- [x] Add session-only results, file save/share actions, startup notification permission/channel setup, and completion notices.
- [x] Add native `dataSync` timeout cancellation and notification deep-link intent.
- [ ] Virtualize queue rows and prove 20-row responsiveness.
- [x] Add rendered UI coverage proving the visible Convert button starts one runner despite rapid duplicate taps.
- [ ] Add rendered navigation ownership and save/share lifecycle coverage.
- [ ] Verify native builds/manifests, real device notifications/deep links/cancellation, conversions, and playback.
- [ ] Complete format-by-format and subtitle-by-container device evidence.
- [ ] Complete TalkBack/200% text, E2E, release artifact, and release-manifest gates.

Current automated evidence: `npx tsc --noEmit`; `npx vitest run` (26 files, 388 tests); `npx expo config --type public`; `npx expo prebuild --platform android`. Device access is currently blocked because `adb` cannot create `\\.android` in this shell. Detailed phase evidence and exact remaining checks are in `implementation-plan.md`.

## Phase objective and links

Objective: one honest end-to-end conversion on a real Android target â€” pick a file with the system document picker, convert to MP4 (H.264 + AAC), watch real progress from FFmpeg statistics, and show the resulting file's cache path or the engine's own error â€” with the risky logic proven by fast tests. **Phase 1 has no destination write** (O-3, 2026-10-27): the result stays in app cache and Phase 2 adds saving to a folder the user chooses.

Source requirements: PR-01, PR-02, PR-03, PR-04, PR-05, PR-06, PR-07, PR-08, PR-09, PR-12, PR-14; TR-01 to TR-08, TR-11, TR-13, TR-16, TR-17, TR-18, TR-21, TR-22, TR-24, TR-30. Acceptance criteria are the eight items in `implementation-plan.md` Phase 1.

## Tasks

| ID | Work item | Deliverable | Dependencies | Acceptance/check | Owner/status |
|---|---|---|---|---|---|
| T-01 | Confirm the blocking decisions and record the target. **Answered 2026-10-27:** O-1 physical phone over USB debugging (emulator out of the workflow), O-2 proceed with `munim-ffmpeg@0.9.2`, O-3 `expo-document-picker` instead of a custom Kotlin SAF module, O-4 MIT application code, O-6 MP3 audio. **Measured on the phone:** API 34 (Android 14), model SM-A135F, primary ABI `armeabi-v7a`; `adb devices` lists it as `device` | Recorded answers in `implementation-plan.md`, `mvp-scope.md`, `trd.md`, `tasks.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `scripts/ffmpeg-build.md` | Owner availability | Written decisions with no "TBD" left in Phase 1 | `shazzark` â€” **done** |
| T-02 | Scaffold an Expo SDK 58 app (blank TypeScript template) **in place at the repository root** with `npx create-expo-app@latest . --template blank-typescript`, keeping every existing `.md` file and `LICENSE` untouched; if the tool refuses a non-empty directory, scaffold into `tmp-scaffold` and move only the app files (package.json, app.json, tsconfig.json, babel/metro config, App entry, assets), never the docs; then `npx expo prebuild --platform android` so `android/` is generated on demand and never committed | App boots from a development build; `.gitignore` covers `android/`, `ios/`, and Expo caches | T-01 | `git log` still shows the initial commit; `git status` shows no generated native project and no modified docs; app launches | `shazzark` â€” **done 2026-10-27** (template scaffolded into `tmp-scaffold` and only app files merged; every document and `LICENSE` untouched) |
| T-03 | Make the Android toolchain reproducible for the session: `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` (reports `openjdk 21.0.9`), `ANDROID_HOME=C:\Users\chido\AppData\Local\Android\Sdk` exported, `adb devices` showing exactly one `device` line, and `local.properties` kept untracked; record resolved Java, Gradle, and Expo SDK versions | Successful first native build | T-02 | `npx expo prebuild` then `npx expo run:android --device` completes from a clean shell; versions recorded | `shazzark` â€” **done (environment)** (JDK 21.0.9 at the Android Studio path and `ANDROID_HOME` exported per session; the build itself is recorded under T-04) |
| T-04 | Add `munim-ffmpeg` and `react-native-nitro-modules` at exact versions with `npx expo install`, register the engine's config plugin in `app.json`, re-run `npx expo prebuild`, and prove registration with a `getFFmpegVersion()` smoke call | Logged engine version; documented API surface (`execute`, `probe`/`getMediaInformation`, `cancel`/`onSessionCreated`, statistics, `listEncoders`, `pickEncoder`) | T-03 | Version printed once from a fresh development build; `listEncoders()` confirms an H.264 encoder on the target; no manual linking or Gradle edits outside the config plugin | `shazzark` â€” **done 2026-10-27** (proven on the phone, not merely installed: `munim-ffmpeg` 0.9.2 and `react-native-nitro-modules` 0.37.1 came in through the config plugin only, with no manual linking and no Gradle edits; the debug build installed as `dev.transmute.app`, encoder resolution picked `h264_mediacodec`, and two real conversions completed â€” an 18 s HEVC source to a 2.37 MB MP4 and a 5 s H.264 source to a 1.18 MB MP4. `getFFmpegVersion()` is exported from `src/native/ffmpeg.ts` but nothing displays it, so the exact engine version string is still unrecorded) |
| T-05 | Install `expo-document-picker` and write the source-intake adapter (no native module of our own): open the picker, receive the cached path, display name, size, and MIME type, and reject anything that is not a local path | `src/native/documentPicker.ts` + the picker dependency | T-02 | Picking a video on the device returns a readable cache path whose size matches the source; a cancelled pick is a first-class "no file" state; **a custom Kotlin streaming module returns only if a >1 GB test proves the cache copy insufficient â€” later phase, not Phase 1 (O-3)** | `shazzark` â€” **done** (`src/native/documentPicker.ts`; device check listed under T-13) |
| T-06 | Domain: preset catalogue (one MP4 preset) and argv builder, pure and dependency-free | `src/domain/presets`, `src/domain/ffmpegCommand` | T-02 | Unit tests assert full argv arrays incl. adversarial names | `shazzark` â€” **done** (`src/domain/presets.ts`, `src/domain/ffmpegCommand.ts`; 10 tests, including `; rm -rf /`, quotes, and unicode as single argv entries) |
| T-07 | Domain: statistics parser and probe parser with fixtures captured from the real engine | `src/domain/progress`, `src/domain/probe` | T-04 | Malformed and reset-counter fixtures handled; no `NaN` reaches the UI | `shazzark` â€” **done** (`src/domain/progress.ts`, `src/domain/probe.ts`; 17 tests. Fixtures are hand-written copies of FFprobe shapes â€” a capture from the real engine is still owed) |
| T-08 | Domain: output-name sanitiser, collision resolver, path policy, free-space estimator | `src/domain/naming`, `src/domain/space` | T-02 | Table-driven tests: traversal, separators, control characters, 255-byte names, emoji | `shazzark` â€” **done** (`src/domain/naming.ts`: traversal, separators, control characters, 200-byte cap with emoji, ` (2)` collisions; 20 tests. The free-space estimator moves to Phase 2 with the destination write, where it has something to protect) |
| T-09 | Application: job pipeline and state machine (preparing â†’ copying â†’ converting â†’ saving â†’ terminal) with cleanup on every terminal path | `src/application/convertJob` | T-05 to T-08 | Fake-port tests: terminal state reached from every failure, cleanup exactly once | `shazzark` â€” **done** (`src/application/convertJob.ts` reducer + `src/application/runConversion.ts`; 29 tests, including cleanup exactly once on every failure, cancel, and success-that-lost-its-output) |
| T-10 | UI: conversion screen with `VideoPreviewCard`, `PresetSelector`, `ConversionSummary`, destination line, `ProgressPanel`, sticky primary action, cancel dialog | Screen wired to the pipeline using tokens | T-09 | PR-01/05/07/08/14 states visible on device; no literal colours in components | `shazzark` â€” **done (code)** (`src/ui/screens/ConversionScreen.tsx` + `PrimaryButton`, `SecondaryButton`, `VideoPreviewCard`, `ConversionSummary`, `PresetSelector`, `ProgressPanel`, `Banner`, `ConfirmDialog`; every colour comes from `src/ui/tokens.ts`. Device look pending T-13) |
| T-11 | Success and failure states: output name and folder, "Open" intent, error banner with recovery action and Details expander for exit codes | Error mapper + success panel | T-09 | PR-09/PR-12 pass; no bare "Error" string anywhere | `shazzark` â€” **done for Phase 1** (`src/domain/errors.ts` with stable codes, recovery sentences, and a Details expander; 15 tests). Open/Share intents are deferred: Phase 1 writes no destination file to open |
| T-12 | Vitest configuration and npm scripts (`test`, `typecheck`, `android`), plus fixture-generation instructions that do not commit binaries | `vitest.config.ts`, scripts, README section | T-02 | `npx vitest run` and `npx tsc --noEmit` both green from a clean checkout; `npm run android` is the documented build entry point | `shazzark` â€” **done** (`vitest.config.mts`, `test`/`test:watch`/`typecheck`/`android`/`prebuild` scripts; 10 files, 118 tests passing with `npm test`; `npm run typecheck` exits 0) |
| T-13 | Device verification pass: the eight Phase 1 acceptance criteria, with `ffprobe` output, cache-size checks, and screenshots | Recorded checklist in the phase report | T-10, T-11, T-12 | Every criterion has attached evidence, including one failure case and one cancel | `shazzark` â€” **in progress 2026-10-27** (`R58T402DKYB`, Android 14 / API 34, package `dev.transmute.app`, 84.0 MB debug APK). Evidenced on the device: the idle state with no file chosen (criterion 1); the system picker returning a cache copy, then a summary of `1.1 MB Â· 0:18 Â· hevc Â· aac` with `Encoder: h264_mediacodec` (criteria 2 and 7 â€” hardware H.264, not `libopenh264`); two jobs reaching `Conversion complete` at `100%` with the cache path shown and the output present in `cache/transmute/job-*/` (2,370,881 and 1,176,024 bytes) (criteria 3 and 4, partly). **Closeout 2026-10-29:** desktop `ffprobe` of the 18 s output (2,370,881 bytes â€” the copy at the repository root, matching the size recorded from the phone) reports `h264` 576Ã—1024 at 30 fps with the `Lavc63.1.102 h264_mediacodec` encoder tag, `aac` 44.1 kHz stereo, duration `18.018685` s, `format_name` `mov,mp4,m4a,3gp,3g2,mj2`, so the container, both codecs, and the hardware encode path are confirmed off-device too. Cancel mid-conversion and the unsupported-file path are now proven at the pipeline level: `cancels mid-conversion without claiming an output or leaving the job directory` keeps progress up to 60 %, reports "cancelled", and removes the job directory exactly once; `refuses an unreadable file before it creates a job directory` is driven by a real FFmpeg 8.0 log captured on 2026-10-29 (`Invalid data found when processing input`) and fails before any directory exists. **Open â€” no device attached on 2026-10-29 (`adb devices` empty):** the on-device cancel run, the on-device unsupported-file message, `ffprobe` of the second output (1,176,024 bytes, never pulled off the phone), and the manifest check â€” the debug merged manifest contains `android.permission.INTERNET` (declared by `expo-file-system` and needed by the development client's Metro connection) even though the storage permissions are correctly blocked. TR-13's no-INTERNET claim can only be evidenced on a release manifest without `expo-dev-client`, so it stays open rather than being called met |
| T-14 | Historical Phase 1 review/handoff | Phase report and outstanding evidence | T-13 | Phase 1 evidence recorded; later phase authorization supersedes approval gate | historical; gaps remain |

## Completion and verification

Phase 1 closes only with all of the following evidence in one report:

1. **Commands run and their output:** `npx vitest run` (count of files/tests, pass/fail), `npx tsc --noEmit`, `npx expo prebuild`, `npx expo run:android` (first run downloads the development client and Gradle dependencies).
2. **Device checklist:** each of the eight acceptance criteria marked pass/fail with the observation that supports it (screenshot name, `ffprobe` output, cache size before/after).
3. **Failure and cancel evidence:** one unsupported file, one revoked grant, one cancel during conversion.
4. **Manifest evidence:** the permission set from the merged manifest, showing no `INTERNET` entry.
5. **Honest gaps:** anything not run, not reproducible, or skipped â€” stated plainly rather than implied to work.
6. **Owner approval:** recorded before any Phase 2 work begins.

Not accepted as completion evidence: a green unit suite alone, a build that compiles without running, or a screenshot without the corresponding device state.

## Optional sections

**Risk and blocker links**

| Risk | Where it is tracked | Mitigation |
|---|---|---|
| Engine does not work under the New Architecture | T-04 stop condition | Stop and report with the build log; do not patch third-party native code blindly |
| Encoder inventory of the phone is unknown until probed | O-1 (answered), T-04 | `listEncoders()` may report no `hevc_mediacodec`, or only the slow `libopenh264` for H.264; record what `pickEncoder` selects and mark the affected preset unsupported rather than silently producing a different output |
| Prebuilt FFmpeg binaries cannot be downloaded | T-04 | `npm install` fetches them in `postinstall`; if that is blocked, run `npx munim-ffmpeg-fetch-binaries` and record the outcome instead of vendoring an unverified copy |
| Phone not visible to `adb` | T-01, T-03 | Check `adb devices` shows `device` (accept the USB-debugging prompt, `adb kill-server` then retry if stale); if the serial is missing, report it â€” do not substitute the emulator, whose encoder path does not represent the target |
| Windows toolchain friction (paths, JDK, NDK) | T-03 | `local.properties`, short workspace path, JDK 17 pinned |
| Vitest cannot transform a module under test | T-12 | Keep the domain layer Node-clean (TR-21); fall back to Jest only if the pure-domain option fails |

**Documentation handoff**

`Readme.md` is the only existing project document; it is updated after Phase 1 with real run instructions and its feature list is corrected to match verified capability. Planning documents are updated when scope changes, not silently.

## Related documents and approval

Links: `implementation-plan.md` (phase definition and completion), `prd.md` (PR-01 to PR-14), `trd.md` (TR-01 to TR-30, test strategy), `architecture.md` (components, D1â€“D8, design tokens).

Authorization: owner instruction dated 2026-10-29 covers continued implementation, dependencies, tests, native builds/device installation when accessible, documentation, and local commits. Do not push or publish. The historical Phase 1 rows above are retained as evidence, not as current authorization gates.


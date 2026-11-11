# Delivery tasks

> **Purpose:** Break Phase 1 of `implementation-plan.md` into small, checkable work items. **Related:** `implementation-plan.md` owns phase order and completion; `prd.md`/`trd.md` own requirements. This list does not replace requirements or approval.
>
> **Document rules:** `[Confirmed]`/`[Inferred]`/`[Recommended]`/`[Open question]` as defined in `project-brief.md`. T-01â€“T-13 are historical Phase 1 records; current cross-phase execution status is maintained below and in `implementation-plan.md`.

**Status:** Authorized execution through Phase 8 plus subtitle-preview correction and Video to GIF feasibility/implementation; Phases 1–8 have open acceptance evidence | **Owner:** `shazzark` | **Updated:** 2026-11-11

**Approved scope:** Phase 8, “Persistent Results and Storage,” was approved for implementation on 2026-11-07. It remains local and offline. Keep implementation, automated checks, and phone evidence distinct.

## Current continuation (2026-10-30)

- **Native build and install:** The fresh short-path build at `C:\t` completed successfully for `armeabi-v7a` with one Gradle worker and CMake parallelism 1 (574 actionable tasks; Ninja passed the shortened-object-path gate). Installed the fresh debug APK at `C:\t\android\app\build\outputs\apk\debug\app-debug.apk` on `R58T402DKYB`. Expo initially bound Metro to IPv6 `::1`, while ADB reverse uses IPv4 `127.0.0.1`; restarting with `--host lan` bound `0.0.0.0` and allowed the app bundle to load. The app launched and Home plus all five labeled tabs rendered. The first device screenshot exposed an oversized Home header; a compact header fix is implemented and passes automated checks, but was not visually rechecked because the phone moved to another active app. Final notification/deep-link and conversion/save/share runtime checks remain open.
- **Frontend and branding:** Original Transmute assets are configured across launcher, adaptive icon, splash, web favicon, notification, and in-app identity. Final icon padding was included in the successful build. Previous APK runtime checks are recorded historically; final APK visual/runtime checks remain pending.
- **Mobile layout, touch, and adaptive icon follow-up:** Replaced fixed status-bar offsets and bottom clearance with provider-reported insets and shared tab-bar tokens; made the launch artwork click-through; added insets/touch regression checks. Regenerated Android adaptive foreground and monochrome layers and built a 32-bit debug APK. TypeScript, Android bundle export, and tests passed (397/397); ADB has no connected phone or emulator, so physical screens, tap/scroll, tab navigation during conversion, nav-mode and large-font layouts, and handset launcher-mask checks remain open.

## Current execution checklist

## Approved Phase 8 task

| ID | Work item | Deliverable | Dependencies | Acceptance/check | Owner/status |
|---|---|---|---|---|---|
| F-01 | Implement Phase 8: SQLite conversion history, durable app-owned media and subtitle files, restart recovery, missing-file handling, and clear-history/file-deletion controls | Versioned schema/migration, persistent storage/recovery, explicit confirmed deletion controls, tests and device evidence | Phase 2 output/cleanup contracts; Phase 4 result identity/lifecycle; Phase 7 privacy/release review | Offline records/files survive restart; migrations preserve existing user data; interrupted/missing outputs are accurately shown; delete and clear actions affect only app-owned files; no network dependency | **Implementation and automated tests present; device checks open** |
| F-02 | Make extracted SRT/VTT preview available in-app without opening a destination picker; preserve durable offline preview. Track Video to GIF with a short clip, selectable size/frame rate, queue and Persistent Results integration. | Preview action and readable cue/timestamp display; GIF capability evidence on A13 before support claim; configurable conversion, animated Results preview, Save/Share, cancellation/failure cleanup | Phase 2 output/cleanup; Phase 4 queue; Phase 8 history; bundled FFmpeg capability | Preview is app-owned and readable after offline relaunch; GIF uses the actual encoder/muxer on A13, animates, survives relaunch, and follows existing cancellation/failure cleanup | **SRT/VTT Results preview, offline reopening, and explicit Save to Phone picker boundary pass on A13. GIF is tracked but unimplemented; capability and all device evidence remain open. Do not advertise GIF until device evidence passes.** |

## Continuation evidence — 2026-11-11

- Verified `main` is at `22c8d91` and tracks `origin/main`; no tracked changes existed at start. `.local-recovery/` was already untracked and remains excluded from commits.
- ADB reports authorized device `R58T402DKYB` (SM-A135F, Android 14/API 34). At start the installed `0.1.0` ARMv7 release was from 2026-11-09; the fresh build below was installed over it with `adb install -r`, preserving app data and existing Results.
- On the fresh 2026-11-11 app, a synthetic MP4 with an embedded `mov_text` subtitle was selected and its SRT track extracted. The extraction view showed `Preview extracted subtitles`; opening it displayed `Transmute A13 subtitle verification` and `00:00:00,500 --> 00:00:02,400`. After Wi-Fi and mobile data were disabled, the app was force-stopped and relaunched. The SRT remained as a Ready subtitle Result; opening it displayed the same cue and timestamps. The tested file path was under `/data/user/0/dev.transmute.app/files/Transmute/outputs/`; the system destination picker was not opened during preview. This closes the SRT preview/offline-relaunch slice only.
- The extraction screen previously described this durable Result as “In the app cache” and warned that Android may clear it. That was inaccurate. Copy now says “Stored in Transmute” and explains that **Save to Phone** is the separate folder-copy action. The final rebuilt APK was installed and the corrected extraction copy was observed on the A13.
- Final release build `app-release.apk` succeeded on 2026-11-11: 60,113,613 bytes, package `dev.transmute.app` version `0.1.0`, ABI `armeabi-v7a`, bundled JS, APK v2 signature verified. Certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` is the local Android debug/test certificate, not a production release credential. The merged release manifest has no `INTERNET`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, or `READ_MEDIA_VISUAL_USER_SELECTED`; it includes Android foreground-service, notification, network-state, boot, wake-lock, and dependency badge/FCM permissions. Final APK SHA-256: `C55A705C872F18A0ED03CCC57D833CEDCD32F645F6B86F58BCEA735BADE8EEF1`.
- The final APK extracted both embedded SRT and VTT from the 137,630-byte synthetic MP4. The SRT in-app preview showed `Transmute A13 subtitle verification` and `00:00:00,500 --> 00:00:02,400`; the VTT preview showed `WEBVTT`, `00:00.500 --> 00:02.400`, and the same cue. With Wi-Fi and mobile data disabled, force-stop/relaunch retained both subtitle Result rows; opening VTT Details showed the same cue and timestamps. The explicit Save action was not pressed, so destination-picker behavior remains open.
- `adb install -r` and cold launch succeeded. Existing Ready rows remained visible; no uninstall, app-data wipe, bulk clear, or existing-result deletion occurred. A separate 137,630-byte synthetic MP4 fixture was staged under `/sdcard/Download/TransmuteQA-20261111/` for the subtitle check.
- `npm test` passed (422 tests / 34 files); `npm run typecheck` and `git -c core.whitespace=cr-at-eol diff --check` passed after source and tracker changes. The final build is also successful. GIF remains tracked as PR-18/TR-38 but is unimplemented; bundled encoder/muxer capability and animation on A13 are unknown, so no support claim is made.
- A sidecar VTT/ASS fixture was staged in a separate QA folder, but the A13's Android DocumentsUI did not surface those files when opened from Transmute's sidecar picker (its Downloads/Documents category showed other indexed documents but no match for the `.vtt`). No sidecar embed attempt is claimed from this fixture. Still open: VTT in MP4/MKV/MOV, styled ASS in MKV, existing VTT-to-WebM conversion/inspection/playback device evidence, MOV/WebM player limitation fix investigation beyond the native track list, other output ffprobe checks, failure/cancellation/storage/background/notifications/recovery, 20-item queue, TalkBack/200% text/reduced motion, isolated deletion-boundary acceptance, complete native-library license audit, full journey/E2E and production signing credentials. No phase is complete. `.local-recovery/` and generated `android/` remain outside commits.

### A13 continuation — 2026-11-11, additional subtitle evidence

- Rechecked release identity before testing: ADB reports `R58T402DKYB device`; `pm path dev.transmute.app` resolved to the installed `base.apk`. Pulled APK SHA-256 and current `android/app/build/outputs/apk/release/app-release.apk` SHA-256 both equal `C55A705C872F18A0ED03CCC57D833CEDCD32F645F6B86F58BCEA735BADE8EEF1` (60,113,613 bytes). This is the same ARMv7 test-signed release recorded above.
- Opened the existing Ready `Transmute-QA-source-176x144.webm` Result. Its details identify source `Transmute-QA-source-176x144.mp4`, format WEBM, and an app-owned file URI. This is the existing VTT-to-WebM QA result. Chose **Save to a folder** explicitly, created a dedicated `Download/TransmuteQA_20261111/` directory in the system picker, and exported only this QA result there. The root Download folder was rejected by Android's privacy guard; the dedicated child folder was accepted. `ffprobe` on the exported 238,615-byte file reports WebM (`matroska,webm`), VP9 video 176×144 at 15 fps, Opus mono 48 kHz, and WebVTT subtitle, duration 2.800 s. Conversion and stream inspection pass. ResultPlayer exposes no subtitle selector for this WebM on the A13, so visible in-app caption playback fails for this sample; stream presence is not equivalent to playback.
- The extraction and Result Details previews show subtitle text in Transmute without opening the destination picker. The folder picker appeared only after an explicit save action. Result Details now labels subtitle export **Save to Phone** as well, matching the extraction panel. No existing Result or exported file was deleted; the QA export is additional data. SRT and VTT cue/timestamp preview and offline reopening remain passed as described above.
- GIF remains unimplemented and unverified on the bundled A13 FFmpeg build. Do not advertise GIF. The current release build has not been changed for GIF, and no new capability claim is made. Remaining open checks include VTT→MP4/MKV/MOV, styled ASS→MKV, MOV/WebM visible playback or a documented native-player boundary, remaining output `ffprobe` copies, reliability/storage/cancellation/background/notification/recovery, queue/navigation/accessibility, isolated deletion boundaries, complete library license audit, and end-to-end release acceptance. Phases 1–8 remain open.
- Rebuilt after the Result Details wording change with the cached Gradle setup: `:app:assembleRelease -PreactNativeArchitectures=armeabi-v7a` succeeded. Updated artifact: 60,113,657 bytes, SHA-256 `9E379F07BD970C4662E8A8B75041A1B6B75F8D247DEBC5F656F70EFC90779CF6`; package `dev.transmute.app` 0.1.0; `armeabi-v7a` only; bundled JS and `libmunimffmpeg.so`; APK v2 signing verified with the same Android Debug/test certificate SHA-256 recorded above. The pulled installed `base.apk` hash matches. Merged release manifest has no `INTERNET`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, or `READ_MEDIA_VISUAL_USER_SELECTED`; notification, foreground-service, network-state, boot, wake-lock, and dependency badge/FCM permissions remain. `adb install -r` and cold launch succeeded without wiping app data.
- On that rebuilt APK, force-stop/relaunch with `wifi_on=0` and `mobile_data=0` retained the SRT and VTT Results. Opening the VTT Result Details showed `WEBVTT`, cue `00:00.500 --> 00:02.400`, and `Transmute A13 subtitle verification`; SRT showed `00:00:00,500 --> 00:00:02,400` and the same text. Neither preview opened DocumentsUI. Result Details visibly labels the separate folder action **Save to Phone**. A previous explicit save of the WebM QA result opened DocumentsUI, and saving only to a newly created QA folder succeeded. The interrupted rebuild attempt using a fresh cache failed before compilation because an offline Gradle plugin was not cached; reusing the existing Windows Gradle cache resolved it and the final build passed.
- On the same installed APK, picked the 138 kB synthetic subtitle MP4 through DocumentsUI, converted it to a Ready MP4 Result, opened the in-app player (the test pattern rendered and Media3 loaded the 2.8 s output), used the explicit folder-save action to export it into the dedicated QA directory, and confirmed its 294,231-byte H.264/AAC MP4 streams with `ffprobe`. With Wi-Fi and mobile data still off, force-stopped and relaunched Transmute; the Ready output and subtitle Results remained visible in Conversion History. This completes one pick → convert → in-app playback → export → offline relaunch journey. It does not prove the full per-phase matrix or every failure/recovery criterion.
- `npm test` passed again: 422 tests in 34 files. `npm run typecheck` passed. `git -c core.whitespace=cr-at-eol diff --check` passed after the documentation and source wording changes.

### Remaining gate ledger after this pass

| Area | Passed or failed in current/latest evidence | Still needs evidence |
|---|---|---|
| Subtitles | SRT→MP4/MKV conversion and visible captions pass; SRT/VTT extraction previews and offline Results reopening pass; VTT→WebM conversion and VP9/Opus/WebVTT stream probe pass. **In-app caption playback does not pass** for the tested MOV (`mov_text`) and WebM (WebVTT): Expo Video/Media3 reports no subtitle track list, so no selector can be rendered. The app has no second caption renderer. | VTT→MP4/MKV/MOV; styled ASS→MKV; playback boundary is documented and external player is required for those tested MOV/WebM outputs. Sidecar VTT/ASS picker did not surface the staged files, so embedding has no new device evidence. |
| Generated output probes | MP4 H.264/AAC, MOV H.264/AAC/`mov_text`, SRT→WebM VP9/Opus/WebVTT, VTT→WebM VP9/Opus/WebVTT, subtitle-free QA MP4 H.264/AAC, and five-minute QA MKV H.264/AAC have probes on exported QA copies. One MP3 output probe exists in earlier device evidence. | Export and probe all remaining app-generated M4A, WAV, FLAC, OPUS, and other retained QA outputs; keep each QA copy in disposable evidence storage and avoid user-named Results. |
| Storage and cancellation | 5-minute conversion, offline persistent Results, one missing-output state, and one dedicated QA output deletion boundary have prior device evidence. | >1 GB input, safe low-storage handling, active conversion cancel, copy cancel, engine failure cleanup, and force-stop recovery during a running conversion. The handset reports about 14 GB free but 88% used; no storage-filling simulation was attempted. |
| Background and queue | Completion notification routing was previously observed; 20-row virtualized rendering has automated coverage. | Notification Cancel/action and permission-denied behavior, verified background progress with foreground state observed concurrently, 20-item phone scrolling, and navigation while a conversion is active. |
| Accessibility and release | 200% navigation labels were fixed and retested previously; current release is 60,113,657 bytes, ARMv7 only, V2 test-signed, merged manifest checked, and full manual E2E passed. OGG remains disabled. | TalkBack across controls and progress, 200% text across screens, reduced motion, full native `.so` license audit/notice completeness, automated on-device E2E, 64-bit release ABI, and production release credentials. |
| Persistent Results | Offline restart, result retention after update, app-owned output playback/preview, and a single QA output deletion/missing state are evidenced. | Broader migration/future-schema checks on device, force-stop during work, complete safe deletion-boundary matrix, and low-space copy behavior. Do not clear or bulk-delete Results in this environment. |

No phase closes from this ledger; each remains subject to its own acceptance criteria.

## Current continuation (2026-11-05)

- `npm run typecheck` passed in this session. `npm test` could not start: Vite received `EPERM` while opening its generated file in `node_modules/.vite-temp`.
- `adb devices -l` returned an empty device list, so no current handset verification was possible.
- The working tree includes shared layout, safe-area, navigation, and touch changes. They were preserved; phone confirmation remains open.
- Historical short-path `armeabi-v7a` debug build and Home/tab launch are recorded below. Release build, final APK interaction, notifications, and conversion/save/share runtime checks remain open.

- [x] **Additional approved follow-up — persistent navigation, animated introduction, and Home dashboard:** Implemented five Expo Router tabs above a root-mounted conversion controller, live queue-count badge, one-time cold-Home logo assembly with reduced-motion and deep-link handling, and a concise dashboard with working video, MP3 extraction, and subtitle-workflow shortcuts. TypeScript, automated tests, and the Android JS bundle pass.
- [x] **Follow-up acceptance details — implementation:** Added session-only activity from real complete/failed/cancelled/recovered-interruption state (no unread tracking), notification permission status and system-settings action, app version/About, offline/history explanation, and license navigation. Added reduced-motion handling, sequential entrances, press feedback, and tab-bar content clearance.

- [x] Reproduce and fix queue startup being blocked on notification permission.
- [x] Add rapid-start guard, notification destination validation, interruption cleanup tests, and a cold-start Home notice for recovered jobs.
- [x] Configure Expo Router routes and keep the processing controller mounted above them.
- [x] Add SQLite-backed conversion/subtitle results, durable file save/share actions, startup notification permission/channel setup, and completion notices; device acceptance remains open.
- [x] Add native `dataSync` timeout cancellation and notification deep-link intent.
- [x] Render queue jobs through a bounded-window `FlatList`; the 20-row configuration test passes.
- [ ] Verify 20-row responsiveness on the device.
- [x] Add rendered UI coverage proving the visible Convert button starts one runner despite rapid duplicate taps.
- [x] Add root-controller mount lifecycle, intro/deep-link priority, queue-badge lifecycle, and Home audio/video preselection tests; conversion start guard still passes.
- [x] Build/install the current armeabi-v7a debug APK; verify Home safe areas, all five tabs, MP3 shortcut, Android Back, picker open/cancel, and notice screen on SM-A135F.
- [x] Verify one MP3 conversion, `ffprobe` output, SAF save with matching SHA-256, share-sheet opening, and app cleanup for the generated test job.
- [ ] Verify notification/background flows, 20-row responsiveness, remaining formats and subtitles, and playback.
- [ ] Verify force-stop recovery with a dedicated disposable test job; preserve the three older cache outputs currently on the phone.
- [ ] Inspect current debug/release merged manifests, release ABIs/artifact sizes, and run release/E2E gates.
- [ ] Complete format-by-format and subtitle-by-container device evidence.
- [ ] Complete TalkBack/200% text, E2E, release artifact, and release-manifest gates.

Prior A13 verification on an earlier debug APK (2026-11-07): npm run typecheck passed; npm test passed then (31 files, 400 tests); npx expo config --type public --json passes; npx expo export --platform android --output-dir .expo-export-check bundles 1,375 modules (generated output removed); npx expo run:android built and installed/launched the fresh armeabi-v7a debug APK on R58T402DKYB. The A13 check covered Home safe areas, tabs, MP3 shortcut, Back, picker open/cancel, notices, one 3-second MP3 conversion, `ffprobe` output (73,493 bytes), SAF save with matching SHA-256, share-sheet open/back, and clearing the generated test job. The app’s three older cache outputs were preserved. Notification/background, 20-row, remaining format/subtitle, playback, recovery, accessibility, and release checks remain open. `git -c core.whitespace=cr-at-eol diff --check` is the repository check for its CRLF files.

## Current continuation evidence (2026-11-07)

- `npm test`: 417 tests across 33 files passed. `npm run typecheck` passed.
- Approved `npx expo prebuild --clean --platform android` completed after backing up the ignored native directory and fixing Reanimated's generated-header path. ARMv7 debug APK built (105,355,223 bytes) and was installed with `adb install -r`; the three older cache outputs were preserved.
- Host `ffprobe` confirmed the isolated QA source has H.264 video, AAC audio, and embedded `mov_text`; SRT, VTT, and ASS fixtures are staged on the A13.
- Release build passed: the test-signed ARMv7 APK is 59,979,181 bytes, includes the offline JS bundle and FFmpeg library, and has no INTERNET or broad storage permission. Its signature matches the installed app; adb install -r updated it without uninstalling or wiping data. Three older cache outputs were present immediately before installation.
- The A13 remains at the secure lock screen. The installed release is not debuggable, so post-install cache byte inspection and all Results interactions are unavailable until unlock. No named test results were generated. All phase statuses remain open; source, automated tests, build, and manifest checks do not substitute for required device evidence.

## Device format checklist

Keep conversion proof separate from playback/preview proof. Mark a box only after an output is retained in Results and inspected on the A13. Sample records created for this checklist must remain on the phone for owner review.

| Test sample | Conversion/stream check | Playback or preview in Transmute |
|---|---|---|
| MP4 (H.264/AAC) | [x] | [x] |
| MKV (H.264/AAC) | [x] | [x] |
| MOV (H.264/AAC) | [x] | [x] |
| WEBM (VP9/Opus) | [x] | [x] |
| MP3 | [x] | [x] |
| M4A (AAC) | [x] | [x] |
| WAV (PCM) | [x] | [x] |
| FLAC | [x] | [x] |
| OGG (Vorbis) | N/A — unavailable: this build has no OGG audio encoder; it needs `libvorbis` | N/A |
| OPUS | [x] | [x] (including after app force-stop/relaunch) |
| Embed SRT in MP4, MKV, MOV, WEBM | [ ] | [ ] Track/content inspection per container |
| Embed VTT in MP4, MKV, MOV, WEBM | [ ] | [ ] Track/content inspection per container |
| Embed ASS in MKV (styled) | [ ] | [ ] Track/content inspection |
| Extract embedded track to SRT | [ ] Preview text/cues in results |
| Extract embedded track to VTT | [ ] Preview text/cues in results |

## Current continuation evidence (2026-11-09)

- `adb devices -l`: `R58T402DKYB device`, Samsung SM-A135F / A13, Android 14, API 34. The phone supports `armeabi-v7a`; the prior arm64/x86_64 release was not used for this device. Built and installed the signed `armeabi-v7a` release with `adb install -r`; package data and existing results were preserved.
- Release artifact check: `app-release.apk` is 60,110,437 bytes and contains `lib/armeabi-v7a/libmunimffmpeg.so` plus `assets/index.android.bundle`. The installed package reports `primaryCpuAbi=armeabi-v7a`, version `0.1.0`. The release merged manifest has no INTERNET or broad storage/media permission. Subtitle conversions ran on this installed release. The native-library license audit, complete release gate, and E2E remain open.
- Fixed an acceptance-blocking queue defect: settled completed/cancelled rows incorrectly hid a new single-file preview and were included in the new batch size. The new A13 run confirmed source preview and embedded `mov_text` track selection with older Results retained. Regression coverage asserts single-work selection and queued-only batch sizing.
- Subtitles on the A13: embedded SRT into MP4 and MKV; each output remains Ready in Results. Selected the embedded track and observed the SRT cue rendered during playback in both containers. Exported only these two QA samples through SAF for host inspection. `ffprobe` confirms H.264, AAC, and `mov_text` in the MP4 (294,808 bytes, 2.800 s) and H.264, AAC, and `subrip` in the MKV (294,048 bytes, 2.809 s).
- Extracted the source's embedded subtitle to SRT and VTT. Both named files remain Ready in Results. In-app previews showed readable text `Transmute offline subtitle sample` and timestamps `00:00:00,000 --> 00:00:02,800` (SRT) and `00:00.000 --> 00:02.800` (VTT).
- An SRT-to-MOV QA result was created and remains in Results, but its stream inspection and subtitle playback have not been recorded. VTT and ASS embedding combinations remain open. The format-matrix aggregate subtitle rows above remain unchecked until each promised container combination is evidenced.
- Force-stopped and relaunched the app with Wi-Fi and mobile data disabled, then opened Results. QA MOV, MKV and VTT rows remained Ready and visible; networking was re-enabled afterward. This confirms Results/history availability offline after restart, but missing-file and deletion-boundary checks remain open.
- `npm test`: 420 tests across 33 files passed. `npm run typecheck` passed. `ffprobe` output evidence and exported QA samples are in the untracked `.local-recovery/` working folder, which is intentionally excluded from the commit. The app Results remain intact; no “Clear finished” or “Clear history and files” action was used.
- Open: finish SRT/VTT/ASS container matrix and subtitle playback/preview; inspect other private outputs; notification/background and cancellation/recovery flows; large-file/low-storage and 20-row device interaction; missing-file and safe deletion; TalkBack/200% text/reduced motion; device E2E; native-library license audit; final release gates. Phases 1–8 remain open.

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

Current authorization: owner instruction on 2026-11-07 covers Phases 1–8, automated/device verification, documentation, and local commits; a later instruction authorizes pushing a verified commit to the configured remote/current branch. Do not publish the app. The historical Phase 1 rows above remain evidence, not current authorization gates.

## Current continuation update (2026-11-07)

- `npm run typecheck` passes; `npm test` passes (33 files, 416 tests); `git -c core.whitespace=cr-at-eol diff --check` passes.
- Earlier lock-screen/build observations in this section are superseded by the post-unlock continuation below.
- The sample-output and playback checklist remains unchecked except for the separate evidence recorded below. Keep all older app data untouched.

## Device continuation update (2026-11-07, after unlock)

- The unlocked A13 (`R58T402DKYB`) cold-started the corrected release with Expo SQLite available after pinning `expo-sqlite` to `58.0.14`.
- The media-scanned synthetic QA MP4 was converted to OPUS. Results showed `Transmute-QA-source.opus`, Ready, 52.2 kB, its source, and an app-owned Documents path. Relaunch retained the result. This verifies OPUS conversion and local history recovery only.
- Player interaction was attempted, but no observable in-app playing state could be confirmed; playback remains unchecked. Other formats, subtitles, notification/recovery, missing-file, accessibility, and safe-deletion checks remain open.
- Automated checks after the pin and UI wording edits: 417 tests across 33 files passed; typecheck passed. The installed release predates only the latest source-copy edit.
- No prior result was deleted. No phase is complete.

## A13 format and playback continuation (2026-11-07)

- A derived 176×144 synthetic fixture was created from the original 160×144 QA input; the original and staged subtitle files remain unchanged. The exact original MP4 failure was: `The video is 160×144, and the device encoder needs at least 176×144. Choose a larger video.` The derived fixture met the encoder minimum.
- Ready Results retained these derived-fixture outputs: MP4 294 kB, MKV 294 kB, MOV 294 kB, WEBM 238 kB, MP3 68.5 kB, M4A 44.2 kB, WAV 246 kB, FLAC 163 kB, and OPUS 52.2 kB. Result names use `Transmute-QA-source-176x144` plus the output extension.
- Each listed format was opened in the in-app player. Video previews displayed the synthetic pattern; audio and video playback were corroborated by Android media-session `PLAYING` state with `error=null`. OPUS was force-stopped and relaunched first; its SQLite Ready row remained, and it played again.
- The lower-resolution original remains as a Failed test row; two intentionally waiting test rows were cancelled through the confirmed Cancel all dialog. Previously completed results were preserved. OGG remains disabled because the build lacks `libvorbis`.
- Device subtitle embed/extract could not be run safely: the queue contains older completed cache outputs, and its `Clear finished` handler deletes each row's cache output directory. Clearing it risks removing prior user outputs. Subtitle fixture and device evidence remain open; no subtitle conversion or preview is claimed.
- Phase 2 cancellation evidence is limited to safely cancelling waiting rows. Low-storage, large-file, active conversion cancel, copy cancellation, notification/background/recovery, 20-row, TalkBack/large-text, and deletion/missing-file device checks remain open.

## Subtitle and reliability continuation (2026-11-07)

- ADB returned `R58T402DKYB unauthorized` on each check, including after restarting the ADB server. The installed app could not be controlled; no conversion, Results preview, playback, export, deletion, or accessibility action was performed on the phone in this continuation.
- Host-only isolated QA files were checked with FFmpeg 8.0/ffprobe 8.0. MP4 and MOV accept SRT/VTT as `mov_text`; MKV accepts SRT/VTT as `subrip` and ASS as `ass`; WebM SRT/VTT fixtures were re-encoded with VP9/Opus and carry `webvtt`. Every valid matrix output has video, audio, and subtitle streams. A first WebM stream-copy attempt is an invalid 284-byte diagnostic and is not a valid sample.
- Host extraction of the MP4 QA track to SRT and VTT preserved the cue text `Transmute A13 subtitle verification` and 0.500–2.400 second timestamps. ASS extraction from MKV preserved `Style: Default` and the cue text; MKV timestamps are 0.520–2.420 on the muxed file, with video beginning at 0.023 seconds (a 0.500–2.400 second relative offset). This 23 ms container timeline offset needs device-app confirmation before asserting exact timing behavior.
- These host artifacts do not satisfy in-app embedding, track inspection, playback, extraction, or Results preview acceptance. The first requested review item—a Results video with embedded subtitles and a readable extracted subtitle—is therefore still blocked until ADB is authorized.
- `npm test` passed 417 tests across 33 files; `npm run typecheck` passed. No phase is complete. Preserve existing Results and do not use Clear finished.

| Device acceptance item | Conversion/operation | Track/content inspection | Playback/preview | Status |
|---|---|---|---|---|
| SRT → MP4, MKV, MOV, WebM | [ ] | [ ] | [ ] | Blocked: ADB unauthorized; host mux matrix only |
| VTT → MP4, MKV, MOV, WebM | [ ] | [ ] | [ ] | Blocked: ADB unauthorized; host mux matrix only |
| ASS → MKV with style | [ ] | [ ] | [ ] | Blocked: ADB unauthorized; host style extraction only |
| Embedded track → SRT and VTT | [ ] | [ ] | [ ] | Blocked: ADB unauthorized; host MP4 extraction only |
| Private app outputs: ffprobe all enabled formats | [ ] | [ ] | N/A | Blocked: app inaccessible; exported QA copies not yet available |
| Background/notification actions; active and copy cancellation; interrupted recovery | [ ] | [ ] | N/A | Blocked: ADB unauthorized |
| Large-file and controlled low-storage cleanup | [ ] | [ ] | N/A | Blocked: ADB unauthorized; no device storage was consumed |
| 20-item responsiveness; TalkBack, large text, reduced motion | [ ] | [ ] | N/A | Blocked: ADB unauthorized |
| Offline restart, missing-file handling, safe QA deletion | [ ] | [ ] | N/A | Blocked: ADB unauthorized; no existing results deleted |

## Follow-up after owner reported A13 authorization (2026-11-08)

- Despite the owner reporting the A13 unlocked and authorized, this host returned `R58T402DKYB unauthorized` from `adb devices -l` before and after `adb kill-server`/`start-server` and `adb reconnect device`. No app interaction was attempted while unauthorized. The installed app was not changed; phone acceptance checks remain blocked.
- Built a local ARM64/x86_64 release APK with `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64`; Gradle completed successfully. The APK is 140,102,912 bytes and contains `libmunimffmpeg.so` for both requested ABIs plus `assets/index.android.bundle`. APK Signature Scheme v2 verifies with the local Android debug certificate. The previous ARMv7 APK (60,110,253 bytes) and metadata were backed up under the untracked `.local-recovery/` area before Gradle replaced its output. Neither artifact was installed or published.
- `aapt dump permissions` on the new APK confirms no INTERNET, READ/WRITE_EXTERNAL_STORAGE, or READ_MEDIA_VISUAL_USER_SELECTED permission. It does include ACCESS_NETWORK_STATE, RECEIVE_BOOT_COMPLETED, and Google Play Services notification-related permissions; these came from merged dependencies. This is a packaged-artifact finding, not an offline device test.
- Native library license audit remains open: `THIRD_PARTY_NOTICES.md` explicitly tracks the line-by-line audit as O-4. TalkBack/large-text/reduced-motion phone review and device E2E also remain open. No phase is complete.

## Acceptance refresh (2026-11-09)

- `adb devices -l` currently reports `R58T402DKYB unauthorized`. No phone actions were run; no subtitle samples were added to Results and existing phone outputs remain untouched.
- `npm test` passed (417 tests across 33 files); `npm run typecheck` passed.
- Host `ffprobe` reconfirmed the valid isolated subtitle fixtures: MP4/MOV SRT or VTT = `mov_text`; MKV SRT or VTT = `subrip`; MKV ASS = `ass`; re-encoded WebM SRT or VTT = `webvtt`. The 284-byte stream-copy WebM artifact is invalid and excluded. MP4 extracted SRT/VTT fixtures contain the expected dialogue and 0.500–2.400 second cue range. Host checks do not count as phone Results or preview evidence.
- The local 140,102,912-byte release APK contains the bundled JS and FFmpeg library for arm64-v8a and x86_64. The merged release manifest has no INTERNET or broad storage/media permission and does include ACCESS_NETWORK_STATE. Static checks do not prove offline behavior or a release conversion on-device.
- All device acceptance items below remain open because ADB is unauthorized. In particular, subtitle samples are not yet in Results. No phase is complete; do not clear finished jobs or delete prior outputs as a workaround.

## A13 acceptance continuation — 2026-11-09, authorized device

This entry supersedes the unauthorized-device note above. `adb devices -l` reports `R58T402DKYB device` (SM-A135F, Android 14/API 34); the handset reports `armeabi-v7a,armeabi`. Existing app data and prior Results were preserved through `adb install -r`; no Clear finished/Clear history and files action was used.

| Check | Evidence from this continuation | State |
|---|---|---|
| ResultPlayer subtitle controls | Added an accessible radio group for Off/available subtitle tracks and source-load/event handling. MKV exposes `und`; selecting it during playback rendered `Transmute A13 subtitle verification`. Added `ResultPlayer.test.tsx` coverage for track selection and late source-load events. | Passed for MKV; MOV and WebM tracks are not exposed by the installed player |
| SRT → MOV | Ready result remains in Results. The named QA copy exported to `.local-recovery/Transmute-QA-SRT-MOV.mov` is 295,003 bytes; `ffprobe` reports H.264, AAC and `mov_text`, 2.8 s. Direct subtitle extraction reads `Transmute A13 subtitle verification` at 00:00:00.500–00:00:02.400. ResultPlayer showed no subtitle selector for this MOV, so in-app caption playback is not passed. | Stream/content passed; player playback open/unsupported |
| SRT → WebM | Ready result remains in Results. QA copy `.local-recovery/Transmute-QA-SRT-WEBM.webm` is 238,615 bytes; `ffprobe` reports VP9, Opus and WebVTT, 2.8 s. Direct extraction reads the expected cue at 00:00.507–00:02.407. ResultPlayer showed no track selector for WebM. | Stream/content passed; player playback open/unsupported |
| SRT → MP4 and MKV | Prior A13 evidence remains valid: Ready Results, selected embedded track and visible cue on phone, with exported copies proving `mov_text` and `subrip`. The new selector is additionally confirmed in MKV. | Passed |
| VTT/ASS container matrix | VTT → WebM was converted and retained as Ready in Results; this turn did not export it or inspect it with `ffprobe`. VTT → MP4/MKV/MOV and styled ASS → MKV have not been run on the phone. Host-only matrix evidence from 2026-11-07 remains separate and does not close these checks. | Open |
| Subtitle extraction and preview | Prior SRT/VTT extraction Results remain Ready; their in-app text and timestamp previews were verified in the preceding continuation. | Passed for existing embedded QA track |
| Large text navigation | A 200% system font check reproduced ellipsized tab labels. The first style-only adjustment did not fix the rendered labels. Replaced these with bounded, custom-rendered labels; after ARMv7 release reinstall, the 200% screenshot visibly shows Home, Convert, Queue, Results and Settings in full. System font scale was restored to 0.8. | Navigation defect fixed and retested; full-screen accessibility review open |
| Reduced animation setting | System animation scales were temporarily set to zero for the large-text capture and restored to 1.0. Full app reduced-motion behavior was not verified. | Partial; open |
| Release package | ARMv7 release built successfully with `-PreactNativeArchitectures=armeabi-v7a`; 60,113,193 bytes. `aapt` reports only `armeabi-v7a`; `apksigner` verifies v2 and SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, matching the installed app. `adb install -r` updated the app; package reports `primaryCpuAbi=armeabi-v7a`. Merged APK permissions contain no INTERNET or broad storage/media access; notification, foreground-service, network-state and launcher-badge permissions remain. | Build/install/static package checks passed; full release gate open |
| Automated checks | `npm test`: 422 tests across 34 files passed. `npm run typecheck` and `git -c core.whitespace=cr-at-eol diff --check` passed. | Passed |

Still open on device: remaining subtitle/container combinations; caption/track behavior for MOV and WebM; `ffprobe` on the remaining private audio/video Results; background conversion and notification action/routing; active conversion and copy cancellation; force-stop recovery during an active job; large-file and safe low-storage cases; 20-item interaction; navigation during conversion; missing-file behavior and individual safe deletion with an exported copy; TalkBack and full-screen large-text/reduced-motion review; device E2E; and the native-library licence audit. Offline Results persistence after a force-stop was recorded above; it does not prove the other storage checks. No phase is complete because its full acceptance criteria are not met. `.local-recovery/` is local evidence and remains untracked; subtitle QA Results on the phone were left intact for review.

### Reliability fixture follow-up — 2026-11-09

- Created a 60-second, 2.9 MB synthetic MP4 by looping the existing 176×144 QA source, placed it under `/sdcard/Download/Transmute-QA-Reliability-20261109/`, and selected it in Transmute. A conversion to MKV completed to a Ready 6.3 MB result in Results. This demonstrates a one-minute input conversion, not the large-file acceptance case.
- Sent the first queued attempt to Home immediately; on returning, the job remained Waiting. Starting it again from the foreground completed. This does not pass background conversion or notification routing, and the before-start background timing remains unresolved.
- Kept the reliability MKV result and all subtitle Results. A copy from Result Details could not be independently verified in the external QA folder during this attempt, so no deletion was performed. The export/deletion-boundary check remains open.

### Notification and deletion-boundary verification — 2026-11-09

- The five-minute QA MKV completed and remained Ready in Results. During its active conversion, the foreground service was running with a progress notification; observed notification progress advanced from 38% to 79% across the following five-second interval after sending a Home key event. A later queue screenshot showed 86%. The system resumed activity was not captured at the same instant, so this is partial evidence only and the background acceptance remains open.
- Opened the 08:05 Transmute “Conversion Complete” notification. `dumpsys activity` confirmed `dev.transmute.app/.MainActivity` resumed; the app routed to Results with `Transmute-QA-Reliability-5m.mkv` at the top. Completion-notification routing passed; active notification actions remain open.
- Saved this dedicated QA MKV to `Download/Transmute-QA-Acceptance-20261109/Transmute_QA_Acceptance_20261109/`. The phone copy and host copy are 31,675,803 bytes; host `ffprobe` reports H.264 video, AAC audio, 300.067 s.
- Used the app’s confirmed **Delete output file** action only on the five-minute QA result. Results now shows **Status: Output missing** with a clear missing/unreadable explanation, while retaining the history row. The exported 31,675,803-byte file remained on the phone after deletion and still probes as H.264/AAC at 300.067 s. The row remains intentionally in Results as missing; no subtitle sample or prior user result was removed.
- This proves one missing-output state and one individual deletion boundary. It does not close force-stop recovery during active work, copy cancellation, low storage, or the full Phase 8 migration/recovery criteria. The earlier note that the export boundary was unverified is superseded by this evidence.


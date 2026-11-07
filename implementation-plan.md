# Implementation plan

> **Purpose:** Turn the drafted scope and requirements into bounded delivery phases with verification and completion conditions. **Related:** `prd.md` and `trd.md` define needs; `architecture.md` describes structure; `tasks.md` decomposes Phase 1.
>
> **Document rules:** `[Confirmed]`, `[Inferred]`, `[Recommended]`, `[Open question]` as defined in `project-brief.md`. The owner authorized implementation through Phase 7 on 2026-10-29. Phase status below separates code, automated evidence, and device evidence.

**Status:** Phases 1â€“7 remain open where acceptance evidence is incomplete; Phase 8 is approved and in progress. Implementation, automated verification, and phone verification are tracked separately below. | **Plan owner:** `shazzark` | **Scope/version:** `v0.1-mvp`

## 2026-10-30 continuation evidence

- **Observed native blocker:** `adb devices -l` returned no device. The installed Android Studio JDK is `C:\Program Files\Android\Android Studio\jbr` (OpenJDK 21.0.9); the Android SDK is `C:\Users\chido\AppData\Local\Android\Sdk`.
- **Exact Ninja failure after a fresh prebuild:** Gradle working directory `C:\Users\chido\Developer\transmute\android\app`; Ninja working directory `C:\Users\chido\Developer\transmute\android\app\.cxx\Debug\86x4e4b4\armeabi-v7a`. Ninja executable: `C:\Users\chido\AppData\Local\Android\Sdk\cmake\3.22.1\bin\ninja.exe`; compiler in the generated command: `C:\Users\chido\AppData\Local\Android\Sdk\ndk\27.1.12297006\toolchains\llvm\prebuilt\windows-x86_64\bin\clang++.exe`. Exact Ninja launch: `"C:\\Users\\chido\\AppData\\Local\\Android\\Sdk\\cmake\\3.22.1\\bin\\ninja.exe" -C "C:\\Users\\chido\\Developer\\transmute\\android\\app\\.cxx\\Debug\\86x4e4b4\\armeabi-v7a" appmodules react_codegen_rnscreens react_codegen_safeareacontext`.

  The safe-area compiler command generated for that Ninja target (from `compile_commands.json`; Ninja failed while statting its object path before invoking clang) was:

  ```text
  C:\Users\chido\AppData\Local\Android\Sdk\ndk\27.1.12297006\toolchains\llvm\prebuilt\windows-x86_64\bin\clang++.exe --target=armv7-none-linux-androideabi24 --sysroot=C:/Users/chido/AppData/Local/Android/Sdk/ndk/27.1.12297006/toolchains/llvm/prebuilt/windows-x86_64/sysroot -DHERMES_V1_ENABLED=1 -DRN_SERIALIZABLE_STATE -Dreact_codegen_safeareacontext_EXPORTS -IC:/Users/chido/Developer/transmute/node_modules/react-native-safe-area-context/android/src/main/jni/. -IC:/Users/chido/Developer/transmute/node_modules/react-native-safe-area-context/android/src/main/jni/../../../../common/cpp -IC:/Users/chido/Developer/transmute/node_modules/react-native-safe-area-context/android/src/main/jni/../../../build/generated/source/codegen/jni -IC:/Users/chido/Developer/transmute/node_modules/react-native-safe-area-context/android/src/main/jni/../../../build/generated/source/codegen/jni/react/renderer/components/safeareacontext -isystem C:/Users/chido/.gradle/caches/9.4.1/transforms/0a502b746dfda44e2480cf51052837b1/transformed/fbjni-0.7.0/prefab/modules/fbjni/include -isystem C:/Users/chido/.gradle/caches/9.4.1/transforms/50fee3f010f433a3a374cb67747e9fe5/transformed/react-android-0.88.0-debug/prefab/modules/jsi/include -isystem C:/Users/chido/.gradle/caches/9.4.1/transforms/50fee3f010f433a3a374cb67747e9fe5/transformed/react-android-0.88.0-debug/prefab/modules/reactnative/include -g -DANDROID -fdata-sections -ffunction-sections -funwind-tables -fstack-protector-strong -no-canonical-prefixes -D__BIONIC_NO_PAGE_SIZE_MACRO -D_FORTIFY_SOURCE=2 -march=armv7-a -mthumb -Wformat -Werror=format-security -fno-limit-debug-info -fPIC -Wall -Werror -fexceptions -frtti -std=c++20 -DFOLLY_NO_CONFIG=1 -DLOG_TAG=\"ReactNative\" -Wpedantic -Wno-gnu-zero-variadic-macro-arguments -Wno-dollar-in-identifier-extension -DFOLLY_HAVE_CLOCK_GETTIME=1 -DFOLLY_USE_LIBCPP=1 -DFOLLY_CFG_NO_COROUTINES=1 -DFOLLY_MOBILE=1 -DFOLLY_HAVE_RECVMMSG=1 -DFOLLY_HAVE_PTHREAD=1 -DFOLLY_HAVE_XSI_STRERROR_R=1 -o safeareacontext_autolinked_build\CMakeFiles\react_codegen_safeareacontext.dir\C_\Users\chido\Developer\transmute\node_modules\react-native-safe-area-context\android\build\generated\source\codegen\jni\react\renderer\components\safeareacontext\ComponentDescriptors.cpp.o -c C:\Users\chido\Developer\transmute\node_modules\react-native-safe-area-context\android\build\generated\source\codegen\jni\react\renderer\components\safeareacontext\ComponentDescriptors.cpp
  ```

  Full failure: `Execution failed for task ':app:buildCMakeDebug[armeabi-v7a]'.` / `C++ build system [build] failed while executing` the Ninja command above; `ninja: error: Stat(safeareacontext_autolinked_build/CMakeFiles/react_codegen_safeareacontext.dir/C_/Users/chido/Developer/transmute/node_modules/react-native-safe-area-context/android/build/generated/source/codegen/jni/react/renderer/components/safeareacontext/ComponentDescriptors.cpp.o): Filename longer than 260 characters`. This establishes the current blocker as the Windows path-length limit, after a prior stale-temp-path failure. No quoting error was observed.
- **Process/security evidence:** a direct PowerShell launch of `clang++.exe --version` returned `Permission denied` in the Codex session, despite the executable existing and its ACL permitting access. Windows Defender Operational events inspected showed configuration-change event 5007 only; AppLocker had no matching events; Code Integrity events referred to `SIHClient.exe` loading an unrelated McAfee plugin. These logs do not establish antivirus as the cause. A Node child launched from the temporary `subst` drive could stat `T:\package.json` but failed enumerating `T:\` with `ENOENT`; the mapped-root build setup therefore cannot be exercised in this Codex process environment.
- **Prebuild and path evidence:** the installed `expo-modules-autolinking` `findPackageJsonPathAsync` walks from `process.cwd()` toward (but not including) the filesystem root, checking each ancestor for `package.json`. A repository mapped directly to `T:\` puts the project at that excluded root; PowerShell can read `T:\package.json`, while Node’s check and Expo fail to find it. Mapping the parent to `T:\` and running from `T:\transmute` lets both PowerShell and Node read the project package and lets `expo prebuild --platform android --clean` finish. A subsequent Gradle build from that mapped path fails in React Native codegen because paths have different roots (`T:\transmute\node_modules\@react-native\codegen\...` versus `C:\Users\chido\Developer\transmute\node_modules\react-native-nitro-modules\android`). The script does not create or alter drive mappings; it checks package discovery and completes clean prebuild from the real repository path before starting Gradle. In this Codex shell, Node’s preflight finds the expected package, but the clean-prebuild attempt cannot unlink the ignored generated `android\build\reports\problems\problems-report.html` (`EPERM`); there are no Java processes, and the file is not read-only. Clean prebuild therefore still needs confirmation in a normal PowerShell session. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -PrebuildOnly` to validate it without native compilation. The full command then uses verified `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` (OpenJDK 21.0.9), `ANDROID_HOME` and `ANDROID_SDK_ROOT` at the installed SDK, one Gradle worker, no Gradle parallelism, a 1 GiB heap, 384 MiB metaspace, CMake parallelism 1, and `armeabi-v7a`. A `CMAKE_OBJECT_PATH_MAX=200` experiment was visible in CMake’s cache but did not shorten Ninja’s offending object path and was removed. Native build and device acceptance remain open.
- **Acceptance remains open:** no newly built APK was installed, and startup, notifications, conversion, phone visual inspection, and device responsiveness were not verified. The successful prior build log is historical evidence only and is not used as current device verification.

## Approved inputs and open decisions

The owner authorized this implementation scope on 2026-10-29. The plan consumes `project-brief.md` (why), `mvp-scope.md` (cut and priorities), `prd.md` (behavior), `trd.md` (testable requirements), and `architecture.md` (structure and design system). Historical decisions and prior device evidence remain recorded below.

**Planning depth [Recommended]:** Standard mode plus a TRD. The project has one deployable component, so Advanced ceremony (risk register, ADRs, integration specs) is not justified; but the native-module integration, storage model, foreground service, licensing, and >1 GB handling each carry testable technical risk, which is exactly what a TRD is for. Deviations from the planning skill's document list, and why:

| Skill document | Decision |
|---|---|
| `design-system.md` | Folded into `architecture.md` as a section. The UI is four screens with one theme; a separate document would fragment a small set of tokens. |
| `testing-acceptance-plan.md` | Folded into `trd.md` ("Test strategy" + "Technical acceptance"). The acceptance criteria already live with the requirements they verify. |
| `appflow.md` | Not created. The primary journey is a single linear path documented in `architecture.md` ("Key flows"). |
| `risk-register.md`, `architecture-decision-record.md`, `external-integrations.md`, `database-schema.md` | Not created. Risks are carried in each phase; D1â€“D8 in `architecture.md` serve as lightweight decision records; there are no external integrations and no database. |

**Decisions that blocked Phase 1 â€” all answered 2026-10-27**

| ID | Question | Why it blocked |
|---|---|---|
| O-1 | Device and API level the work is verified on. **Answered 2026-10-27:** a physical Android phone over USB debugging, built and installed with `npx expo run:android --device <adb serial>`; the emulator is closed and out of the workflow. **Measured:** API 34 (Android 14), model SM-A135F, primary ABI `armeabi-v7a` | Phase 1 acceptance requires a real Android target with a hardware encoder; the >1 GB and background claims cannot be faked, and an emulator has no hardware encoder |
| O-2 | Whether `munim-ffmpeg` (Nitro module, Expo development build) runs unpatched under the New Architecture on the target. **Answered 2026-10-27:** proceed with `munim-ffmpeg@0.9.2`. A prebuild or build failure caused by the engine is recorded verbatim and stops the work; the documented fallback needs the owner's explicit approval | If it does not work, the whole plan changes, not just one phase |
| O-3 | Whether a small custom Kotlin SAF streaming module is acceptable. **Answered 2026-10-27: not needed for Phase 1** â€” `expo-document-picker` copies the selection into app cache and that path is FFmpeg's input. A custom Kotlin streaming module may return only if a >1 GB test proves the cache copy insufficient, in a later phase | It decided whether Phase 1 includes native code of our own; it now does not |
| O-6 | Audio default. **Answered 2026-10-27: MP3** for audio-only output, with MP4 video presets re-encoding audio to AAC | It changes the argv the Phase 1 tests assert |
| O-4 | Project licence. **Answered 2026-10-27: MIT** for the application code, with the LGPLv3 FFmpeg conveyed through `THIRD_PARTY_NOTICES.md` and `scripts/ffmpeg-build.md` | It decides what `LICENSE` says and what ships in the notice screen |

**Milestones (sequence, not dates)**

- **M1 â€” A real conversion works once** (Phase 1): a phone converts an MP4 offline and the file plays.
- **M2 â€” It survives real files** (Phase 2): >1 GB, low storage, cancel in every stage, no debris.
- **M3 â€” It survives real life** (Phase 3): screen off, app backgrounded, process killed.
- **M4 â€” It handles more than one file** (Phase 4): the queue.
- **M5 â€” It handles the advertised formats** (Phase 5): the matrix and audio extraction.
- **M6 â€” It handles subtitles** (Phase 6).
- **M7 â€” It is shippable** (Phase 7): accessibility, licence audit, E2E gate, release build.

Dependencies: M2 depends on M1; M3 depends on M2 (a service is only worth adding once the pipeline is stable); M4 depends on M3 (queue rows need the state machine to be trustworthy); M5 is independent of M4 and may run in parallel if the owner wants the format list sooner; M6 depends on M5's container support; M7 depends on all.

## Phases

### Phase 1 â€” Core vertical slice: pick, convert, save, with real progress

- **Objective:** Prove the riskiest thing first â€” that FFmpeg runs inside this app on a real Android target â€” and complete one honest end-to-end conversion.
- **Scope:** Scaffold an Expo SDK 58 app (blank TypeScript template) with `npx create-expo-app` at the repository root, preserving `Readme.md` and Git history; adopt continuous native generation with no committed `android/` directory and generate the native project with `npx expo prebuild`; configure the Android toolchain; integrate `munim-ffmpeg@0.9.2` + `react-native-nitro-modules` through the engine's config plugin and prove a smoke call from a development build; select a file with `expo-document-picker` (which copies it into app cache); probe it; convert to MP4 (H.264 + AAC); show progress from engine statistics; show success with the cache output path and failure with the engine's own message. **Excluded:** destination writing (Phase 2), multiple formats, queue, >1 GB optimisation, background service, subtitles, accessibility audit, licence screen, any native module written by this project.
- **Dependencies:** O-1 to O-6 (all answered 2026-10-27: physical phone, engine 0.9.2, `expo-document-picker` instead of a Kotlin module, MIT licence, MP3 default); Android SDK and a JDK exported in the shell. Measured 2026-10-27: `ANDROID_HOME` unset, no `java` on `PATH`, `JAVA_HOME` empty; the SDK is present with `adb.exe` at `C:\Users\chido\AppData\Local\Android\Sdk\platform-tools\adb.exe`, and Android Studio's JDK exists at `C:\Program Files\Android\Android Studio\jbr` and reports `openjdk 21.0.9`, so both need exporting in the session rather than installing; the verification target is the owner's phone over USB debugging, which `adb devices` now lists as `device` (API 34, `armeabi-v7a`), so the build gate is `npx expo run:android --device` with only that device attached and no emulator fallback. Two network-dependent setup steps belong to this phase: `npm install` fetches the engine's prebuilt FFmpeg libraries (checksum-verified, well over 100 MB across three ABIs) and the first `npx expo run:android` downloads Gradle dependencies plus the development client (`trd.md` constraint 7).
- **Deliverables:** a runnable debug app; `src/domain` with tested builders, encoder preference, and filename sanitiser; `src/native/ffmpeg.ts` as the thin engine adapter; the `expo-document-picker` intake adapter; a conversion screen wired to the conversion call; a short `Readme.md` update describing how to run it; recorded test output.
- **Acceptance criteria:**
  1. The app launches on the target and shows the idle state from `prd.md` PR-14.
  2. Picking a 30â€“60 second MP4 shows name, size, and duration (PR-01, PR-02).
  3. Convert writes an MP4 into the app cache (Phase 1 has no destination write), the path is shown, and a third-party player opens it; desktop `ffprobe` reports `h264` and `aac` (PR-03, PR-09, TR-02).
  4. The progress bar follows real statistics, never decreases, and reaches 100% before the success state (TR-04).
  5. Cancel during conversion ends in "Cancelled" with the job cache removed (TR-08, TR-11).
  6. An unsupported file and a file the provider refuses to copy each show their own message, never a bare "Error" (TR-30).
  7. Vitest covers the argv builder (happy path, invalid input, missing option, and the MP3/FLAC/OPUS target mapping), encoder preference (hardware then software then a specific error), and filename sanitising (separators, reserved characters, forced extension); adversarial names are asserted as full argv arrays (TR-03, TR-16, TR-22).
  8. `npx tsc --noEmit` is clean and the merged manifest contains no `INTERNET` permission (TR-01, TR-13).
- **Verification:** `npx vitest run`; `npx tsc --noEmit`; `npx expo run:android --device <adb serial>` (which runs the Gradle build, installs the development client, and launches the app on the phone â€” expect the first run to download the client and dependencies); manual device checklist with screenshots and the `ffprobe` output pasted into the phase report.
- **Risks/blockers:** the Nitro module may not register under the New Architecture in a prebuild-generated project (stop and report, do not patch blindly); the phone's encoder inventory is unknown until `listEncoders()` runs, so H.264 may resolve to the much slower `libopenh264` â€” and the target is a 32-bit `armeabi-v7a` device, so a software encode of even a 30-second clip may take minutes; record what `pickEncoder` actually selects instead of assuming the fast path, and keep the cable connected because a dropped USB connection aborts the install; the NDK/C++ build may fail on a Windows path with spaces or a long workspace path; the picker copies the whole file into cache, which is the cost Phase 2 measures; Gradle may target an unavailable JDK.
- **Completion conditions:** all eight acceptance criteria evidenced, test output and device checklist attached to the phase report, no uncommitted debugging code, and the owner's explicit approval to continue. **Stop conditions:** engine incompatibility after documented attempts; no Android target available; any required dependency whose licence would change the project's distribution terms.

### Phase 2 â€” Real files: streaming, space, cleanup, cancel everywhere

- **Objective:** Make the pipeline trustworthy for the files that matter â€” above 1 GB â€” and prove that no terminal path leaves debris.
- **Scope:** Chunked copy-in and copy-out with byte progress and cancellation; free-space preflight including peak usage (source copy + output estimate + headroom); per-job cache directories with guaranteed removal; startup sweep for orphans; cancel during copy-in, conversion, and copy-out; output verification (size and hash) before reporting success. **Excluded:** background service, queue, new formats.
- **Dependencies:** Phase 1 closed; a fixture above 1 GB (generated locally); a device with enough storage.
- **Deliverables:** storage gateway with cancellation and progress; space estimator with tests; cleanup with tests; the phase's device evidence.
- **Acceptance criteria:**
  1. A 1.2 GB input converts without out-of-memory failure or ANR; peak Java heap stays bounded and the measured value is recorded (TR-05, TR-24).
  2. Conversion is refused before starting when free space is below the estimated peak, with a message naming the shortfall (TR-07).
  3. Cache size before and after each of success, cancel, and failure matches (TR-08).
  4. Cancelling during copy-in, during conversion, and during copy-out each ends in "Cancelled" with no partial destination file on the internal-storage provider (TR-06, TR-11).
  5. The saved file's size and hash match the cache file (TR-06).
  6. A force-stop mid-conversion leaves a cache directory that the next launch removes (TR-08).
- **Verification:** Vitest for estimator, path policy, and job-pipeline order (fake ports); device runs for 1.2 GB, low storage, three cancel points, and force-stop; profiler screenshot for memory.
- **Risks/blockers:** peak storage may exceed what a 1.2 GB test file allows on the device â€” then the check is done with the largest file the device supports and the limitation is reported; provider-specific write failures may make cleanup impossible (report, do not hide).
- **Completion conditions:** evidence for all six criteria; recorded peak memory and free-space mathematics; owner approval.

### Phase 3 â€” Background survival and interrupted jobs

- **Objective:** A job must survive the screen going off, the app being backgrounded, and the process being killed.
- **Scope:** Foreground service with an ongoing progress notification and a Cancel action; notification permission request with rationale on Android 13+; service type declaration for Android 14+; a persisted "in progress" marker; interrupted-job detection and cleanup on launch; reporting interruption once. **Excluded:** resumable jobs, scheduled/deferred work, parallel jobs.
- **Dependencies:** Phase 2 (a stable pipeline is worth keeping alive); TD-2, TD-6 decisions; device at an API level where the service rules apply.
- **Deliverables:** service module; notification contract; recovery path and its message; documentation of the service type and the daily limit that applies.
- **Acceptance criteria:**
  1. A job started, then backgrounded with the screen off for five minutes, either completes or shows real progress, and the notification matches the app (TR-10, PR-10).
  2. Cancel from the notification ends the job as cancelled and the app agrees on return (TR-11).
  3. With notifications denied, the conversion still completes; the app says the notification is unavailable (TR-29).
  4. After `adb shell am force-stop` mid-job, the next launch shows "Interrupted", explains it, and leaves an empty cache (TR-12, PR-12).
  5. The declared service type appears in `dumpsys activity services` and is documented with the API level it was verified on (TR-10).
- **Verification:** device runs at the lowest and highest available API levels; `dumpsys` output; notification screenshots; state-machine tests for the interrupted transition.
- **Risks/blockers:** foreground-service type rules and daily limits change across Android versions and are documented here as [Inferred] until observed on a device; a wrong type can crash on API 34+.
- **Completion conditions:** all five criteria evidenced, the API-level matrix recorded, owner approval.

**Phase 3 implementation status (2026-10-29) â€” incomplete, device evidence missing.** The scope was delivered as real code: a local Expo module (`modules/transmute-background`) with a `dataSync` foreground service, an ongoing silent notification whose wording is a pure tested module, a Cancel action that reports back through one event, the `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` / `POST_NOTIFICATIONS` permissions in `app.json`, plus the batch queue this phase needed to show aggregate progress. Automated evidence that **was** obtained: `npx tsc --noEmit` clean; `npx vitest run` 366 passing tests; `npx expo prebuild --platform android` regenerated `android/`; `:transmute-background:compileDebugKotlin` and `:app:processDebugMainManifest` both succeeded; the merged debug manifest contains the three permissions and `<service â€¦ android:foregroundServiceType="dataSync">`. Evidence that was **not** obtained: every item in acceptance criteria 1â€“5, because no device was attached (`adb devices` returned an empty list on 2026-10-29). Criteria 2 and 5 in particular â€” Cancel from the notification, and the type shown by `dumpsys activity services` â€” are runtime behaviour and cannot be inferred from a manifest. Criteria 3 and 4 (notifications denied; `force-stop` recovery: the persisted "in progress" marker and the interrupted row, TR-12) are also not implemented yet: the queue lives in memory for one app run (D6), so a process death loses the batch and the "Interrupted" state does not exist to show. The phase stays open until a device run records them.

**Implementation supplement (2026-10-29):** since the historical status above, the app now writes an app-private active marker for a batch, removes job-cache directories when that marker is found on launch, clears the marker after batch completion, and announces interrupted cleanup. A focused recovery test verifies cleanup precedes marker removal and preserves the marker on cleanup failure. The native service now handles Android 15+ `dataSync` timeout by broadcasting cancellation and stopping promptly. The notification channel is created before the one-time startup permission request. These changes have not been exercised on a phone; the earlier device gaps remain open.

### Phase 4 â€” Queue several files (original scope)

- **Objective:** Handle the real usage pattern: three to ten files added at once, converted one after another without supervision.
- **Scope:** Multi-select intake from the picker; FIFO queue with concurrency one; per-row state and progress; remove a queued row; cancel the running row; aggregate progress on the notification; virtualised list for larger batches. **Excluded:** reordering, per-row presets, parallel conversion, persistence of the queue across launches.
- **Dependencies:** Phase 3; TR-09; architecture D2.
- **Deliverables:** queue reducer with tests; job list screen; notification that reflects the running item and the queue depth.
- **Acceptance criteria:**
  1. Three selected files convert strictly in order; exactly one row is converting at a time (TR-09, PR-11).
  2. Removing a queued row means it never runs and leaves no cache (PR-11).
  3. A failure in the first row does not stop the remaining rows, and its reason is preserved per row (PR-11, TR-30).
  4. Aggregate progress on the notification is accurate enough to match the running row (TR-10).
  5. With a 20-row list, scrolling stays smooth and rows render lazily (TR-24).
- **Verification:** reducer unit tests for add/remove/cancel/fail ordering; device run with three and with twenty rows; notification screenshots.
- **Risks/blockers:** queue state spread across the service, storage gateway, and UI can drift; the queue reducer must be the single source of truth or the phase fails review.
- **Completion conditions:** five criteria evidenced; reducer tests cover every transition; owner approval.

**Revised Phase 4 extension â€” UI/UX, navigation, notifications, results, and runtime fixes.** The owner expanded Phase 4 on 2026-10-29 while retaining the five queue criteria above. This extension adds Expo Router routes; a shared, continuously mounted processing owner; grouped presets; startup notification permission and channel setup; truthful completion notifications; queue/result screens; session-only result history; Save and Share actions; notification deep links; and process-interruption cleanup.

**Current implementation status:** Router paths are wired through a controller mounted above the route stack. The Convert handler claims the runner before asynchronous notification work; duplicate taps are guarded; the runner stays FIFO and serial; notification taps have an allowlisted `/results` destination; completion notices are posted only when every row completed; an app-private marker triggers partial-cache cleanup after process death; results remain memory-only. Unit coverage exercises the rendered Convert button, duplicate-tap prevention, notification destination, recovery ordering, FIFO, and failure continuation. **Not yet verified:** smooth scrolling with 20 rows on device, native notification permission and progress, native tap handling in open/background/cold states, phone navigation while converting, result playback/save/share lifecycle, and all device acceptance. The Phase 4 extension remains incomplete until the available build and device gates pass.

### Phase-by-phase evidence summary (2026-11-05 audit; historical snapshot)

| Phase | Implemented | Automatically verified | Device verified | Blocked or not run |
|---|---|---|---|---|
| 1 â€” Core conversion | Yes; prior work | Earlier 384-test-era checks are recorded in T-13 | Prior API 34 conversion and `ffprobe` evidence recorded in T-13 | Several original acceptance items remain open in the historical T-13 record |
| 2 â€” Files, save, cleanup | Pipeline, SAF save/cancel, cleanup code exists | Existing pipeline and save tests | Prior device evidence is not complete | >1 GB, low-space, all save cancel points, and cache measurements remain open |
| 3 â€” Background and recovery | Native dataSync service; this revision adds timeout handling and interrupted marker cleanup | Native build and manifest merge attempted below; recovery unit tests | No current device evidence | Permission denial, screen-off progress, notification cancel, force-stop and timeout runtime checks |
| 4 â€” Queue + revised UI/UX | Queue, Router shell, results, save/share wiring, notification routing; current work adds safe-area/navigation/touch fixes | Historical 396-test suite and TypeScript/build evidence are recorded in `tasks.md`; current typecheck passes, current Vitest run is blocked by `EPERM` creating Vite's config temp file | Earlier debug Home/tabs launch recorded; current ADB has no connected device | Current navigation/touch fixes need phone confirmation; device responsiveness for 20 rows, result lifecycle, and native notification flows remain open |
| 5 â€” Format matrix/audio | Presets, capability checks, argv, input validation, audio extraction paths exist | Preset, encoder, probe, command tests | No complete format-by-format phone/`ffprobe` matrix | Real output/playback evidence per enabled preset |
| 6 â€” Subtitles | SRT embed, extraction, validation, per-container rules exist | Subtitle, pipeline, and naming tests | No complete container/player matrix | Real `ffprobe` track listings and playback checks |
| 7 â€” Hardening/release | Contrast tokens/tests, inline notices summary, license files, accessibility labels exist | Unit tests; release native build not complete | No TalkBack, scaling, E2E, or installed release evidence | Line-by-line library audit, automated device journey, release ABI artifacts/sizes, merged release permission audit |

**Audit note (2026-11-05):** Phase 1 retains historical API 34 conversion and desktop `ffprobe` evidence, but several original acceptance checks remain open. Phases 2â€“3 have implemented pipeline/save/cleanup and foreground-service/recovery code with automated evidence recorded historically; large-file, low-space, process-death, and native notification behavior remain unverified on the phone. Phases 4â€“7 have the implementation and evidence limits summarized above. In this session, `npm run typecheck` passed; `npm test` did not start because Vite could not write `node_modules/.vite-temp/...` (`EPERM`); `adb devices -l` returned no attached device. No phase is closed by code presence alone.

### Current audit and continuation (2026-11-07)

The phase review against current source and recorded evidence keeps every phase open until its acceptance evidence is complete.

| Phase | Implemented features | Automated verification | Phone verification | Remaining checks / blockers |
|---|---|---|---|---|
| 1 — Core conversion | Picker, probe, MP4 conversion flow, progress and error states; historical real conversion evidence remains valid for that APK | Current suite: 400 tests across 31 files; typecheck, Android bundle export, and fresh debug build pass | Historical API 34 MP4 conversion and desktop ffprobe are recorded in T-13; current picker opened/cancelled and source metadata was read, but current MP4 conversion was not rerun | Current-route MP4 conversion, original cancel/unsupported-file device cases, complete manifest evidence |
| 2 — Real files, save and cleanup | Chunked storage, free-space checks, cancellation and cleanup code are present | Covered by current automated suite; phase-specific fake-port tests remain in the suite | A 3-second output was saved through SAF; saved size and SHA-256 matched the cache output; test job was cleared. Three older cache outputs were preserved | >1 GB or maximum available fixture, low space, cancel/failure cache measurements, copy-stage cancellation, force-stop cleanup |
| 3 — Background and interrupted jobs | Foreground service, timeout handling, active marker, cleanup, and one-time Interrupted notices on Home and Activity are implemented | Current suite includes notification and recovery tests; Android export and fresh debug build pass | Recovery was not simulated because its cleanup would delete three existing cache outputs; notification/background behavior remains untested | Screen-off progress, permission denial, notification cancel, force-stop notice/cleanup, service type and timeout runtime checks |
| 4 — Queue and navigation | FIFO queue, result/session history, notification routing, shared route controller, safe-area frame, tab clearance, and touch changes are in source | 400 tests, typecheck, public Expo config, Android bundle export, and fresh debug build pass | Current Home visually checked; all five tabs, MP3 shortcut, Android Back, picker open/cancel, result detail, save/hash, share sheet open/back, Settings, and notice screen were exercised | Twenty-row scrolling, notification flows, conversion while navigating, result playback and final motion/accessibility review |
| 5 — Format matrix/audio | Presets, capability validation and audio extraction paths are implemented | Preset, encoder, probe and command cases are covered by the current suite | On-device MP3 extraction passed; ffprobe reports MP3 audio, 3.000 seconds, 73,493 bytes. No complete format/playback matrix | Run each other enabled preset on-device; record ffprobe and playback or document unsupported combinations |
| 6 — Subtitles | Sidecar validation, per-container embed/extract and naming paths are implemented | Subtitle and pipeline cases are covered by the current suite | No complete container/player evidence | Record track listings, extracted dialogue/timestamps and playback for claimed combinations |
| 7 — Hardening/release | Contrast checks, accessibility labels and notices are present | Current unit suite passes; release build and release-manifest checks are not run in this continuation | In-app MIT/LGPL notices opened on the phone; no TalkBack, 200% scaling, E2E or release-install evidence | Library license audit, accessibility pass, automated device journey, release ABIs/sizes and merged release permissions |

Checks run 2026-11-07: npm run typecheck passed; npm test passed (31 files, 400 tests); npx expo config --type public --json passed; npx expo export --platform android --output-dir .expo-export-check bundled 1,375 modules successfully; npx expo run:android built the fresh armeabi-v7a debug APK and installed/launched it on R58T402DKYB. Phone checks covered Home/safe areas, all tabs, MP3 shortcut, Android Back, picker, one MP3 conversion, SAF save with matching size/hash, share sheet opening, and in-app notices. `ffprobe` confirmed MP3 audio and 3.000 seconds. The test job and only generated test files were removed; three older app-cache outputs remain untouched. Notification/background, 20-row, remaining format/subtitle, playback, accessibility, recovery, and release checks remain open. No phase is complete based on code presence alone.

### Verification refresh — 2026-11-07, after Phase 8 approval

The older audit above is retained as historical evidence. This refresh records the current continuation and supersedes stale statements there about the test runner, ADB availability, and Phase 8 authorization.

| Phase | Implementation state | Automated evidence | Phone evidence | Open checks |
|---|---|---|---|---|
| 1 | MP4 route and device checks remain in scope | 416 tests pass; typecheck passes | Prior MP4 checks are historical; current conversion awaits this build | Current-route conversion and remaining device cases |
| 2 | Output cleanup and cancellation paths implemented; durable copy is chunked and cancellable | Application suite passes; native copy awaits runtime test | Device reports 13 GB free; no storage-filling simulation attempted | Large input, low-space failure, copy cancel and cleanup measurements |
| 3 | Foreground notification and scoped recovery logic implemented | Notification/recovery tests pass | Current notification/background/force-stop checks await install | Notification controls, background progress and force-stop recovery |
| 4 | Queue, shared navigation/layout/touch, and bounded 20-row list implemented | 416 tests pass, including 20-row rendering and text preview | Prior Home/tab/Back checks recorded; new playback/20-row check pending | Device navigation during conversion, scrolling, playback, motion/accessibility |
| 5 | All 10 catalogue audio/video presets remain conditional on encoder detection | Preset, command and probe tests pass | No new per-format conversion or playback evidence | Probe and playback every enabled format; adjust claims to actual result |
| 6 | SRT/VTT/ASS input validation; ASS style preserved only in MKV; SRT/VTT extraction | Subtitle and pipeline tests pass | New subtitle-container evidence pending | Device embed/extract, inspect streams/content, playback/preview |
| 7 | Notices/accessibility foundations implemented | Unit suite passes | Prior notices screen only; current accessibility/release checks open | Library audit, TalkBack/large text, E2E, release artifact/manifest/size |
| 8 | SQLite v1, durable app-owned media and subtitle outputs, restart reconciliation, missing-file state, confirmed deletion controls implemented | 9 result-history tests and 416-test suite pass | Native migration/offline restart/deletion checks pending | Device restart, missing output and destructive-action scope |

No phase is complete based on source code or automated checks alone. `npm test` passed (33 files, 416 tests); `npm run typecheck` passed. The direct non-clean debug build reaches C++ compilation but fails because Reanimated's generated `react/renderer/components/rnreanimated/Props.h` is absent. Forced module and app codegen tasks remain skipped/up-to-date and do not create it. Expo clean prebuild was rejected by automatic review because it replaces the entire ignored `C:\t\android` project and may destroy local native changes. Phone acceptance is blocked pending approval to regenerate that directory or another safe codegen fix.

### Phase 5 â€” Format matrix and audio extraction

**Current status:** Preset catalogue, runtime encoder/input checks, visible unavailable reasons, audio extraction, validation, command generation, and support matrix are implemented. Preset/encoder/probe/command tests pass. Real device conversions and `ffprobe`/playback remain unverified for all enabled formats except historical MP4 evidence, which predates the current route. Phase 5 is incomplete.

- **Objective:** Deliver the advertised formats the build actually supports, without touching UI logic.
- **Scope:** Presets for MKV, WEBM, M4V/MOV containers and audio extraction to MP3, AAC, WAV, FLAC, OGG/OPUS; capability detection for codecs that are absent from the build; preset-aware validation (e.g. no audio stream â†’ extraction disabled); documented support matrix. **Excluded:** subtitles, hardware encoders, size targeting, remux-only fast path.
- **Dependencies:** Phase 1 argv builder and preset model; Phase 2 pipeline; knowledge of which libraries the bundled `libmunimffmpeg.so` contains (TR-27 audit input).
- **Deliverables:** expanded preset catalogue with a test row per preset; support matrix in the README; disabled-state reasons in the selector.
- **Acceptance criteria:**
  1. Every enabled preset converts a fixture and desktop `ffprobe` confirms the requested container and codec (TR-18).
  2. Every advertised format appears in the README matrix as supported or explicitly unsupported with a reason â€” no silent gaps (`mvp-scope.md` non-goals).
  3. A preset that cannot apply is disabled with a visible reason and never falls back silently (TR-19).
  4. Audio extraction produces a playable audio file with the expected duration (Â±1 second of the source, allowing for encoder padding).
- **Verification:** one command-builder test per preset asserting the full argv; device conversion per enabled preset with `ffprobe` output recorded; manual playback of each result.
- **Risks/blockers:** the bundled binary may not include every advertised codec; the honest answer is a documented "unsupported", not a build hack. Some combinations are slow enough that the device test needs patience rather than a timeout bump.
- **Completion conditions:** matrix complete and truthful, tests per preset, owner approval.

### Phase 6 â€” Subtitles: embed and extract

**Current status:** Sidecar validation, subtitle embedding/extraction paths, naming, and per-container codec rules are implemented and covered by automated tests. Device track listings and player behavior have not been verified; Phase 6 is incomplete.

- **Objective:** Handle subtitle tracks, the remaining advertised feature.
- **Scope:** Choose a sidecar subtitle file (SRT/ASS/VTT) and embed it into the selected container; list embedded subtitle tracks and extract one to SRT or VTT; validation of the sidecar before starting; naming and collision rules reused unchanged. **Excluded:** styling/burn-in of subtitles into the picture (a different, much slower operation), automatic language detection, subtitle editing.
- **Dependencies:** Phase 5 (a container matrix, because container subtitle support differs), Phase 2 pipeline; MP4 subtitle semantics need an explicit check â€” not all players display `mov_text` tracks.
- **Deliverables:** subtitle presets and validation; extraction-to-file path reusing the streaming writer; documented per-container subtitle support.
- **Acceptance criteria:**
  1. An SRT sidecar embedded into an MKV is selectable in a player and its text matches the source (PR-level behavior defined in `mvp-scope.md`).
  2. Extraction from a file with an embedded track produces a text file whose lines match the expected dialogue, with timestamps in the chosen format.
  3. A malformed sidecar is rejected before any copying starts, with a specific reason.
  4. MP4 subtitle behaviour is documented explicitly, including any player that ignores the track.
- **Verification:** device conversions with recorded `ffprobe` track listings and player screenshots; unit tests for sidecar validation and output naming.
- **Risks/blockers:** subtitle support varies by container and player more than any other feature; promising "subtitles work" without a per-container table would be misleading.
- **Completion conditions:** the per-container table is honest, device evidence exists for each claimed combination, owner approval.

### Phase 7 â€” Hardening and release readiness

**Current status:** Existing contrast tests, accessibility labels, license notices, and an in-app notice summary are present. A fresh `armeabi-v7a` debug build is recorded as successful in `tasks.md`; the release build has not been attempted. The line-by-line native library license audit, TalkBack/200% scaling review, device E2E, release APK build and size record, and merged release-manifest permission check are not complete. Phase 7 is incomplete; this app is not release-ready.

- **Objective:** Make the app defensible: accessible, licensed, measured, and reproducible.
- **Scope:** Complete the error taxonomy; TalkBack pass and 200% scaling fixes; token-contrast test wired into the suite; licence audit and in-app notice screen; release build for `arm64-v8a` and `x86_64` with recorded sizes; E2E flow (Maestro or Detox) for pick â†’ convert â†’ save plus cancel; README rewritten to match verified capability; `Readme.md`'s unverified claims corrected. **Excluded:** CI pipeline, store listing assets, analytics, localization, light theme.
- **Dependencies:** Phases 1â€“6 as applicable to shipped features; O-4 (licence audit), O-5 (E2E tool).
- **Deliverables:** hardened build, audit document, notice screen, E2E flow, release artifacts, corrected README, final report.
- **Acceptance criteria:**
  1. TalkBack reads every control meaningfully; progress announces at phase change and completion; nothing is clipped at 200% text scale (TR-20).
  2. Token-contrast tests pass as part of `npx vitest run` (TR-20).
  3. The licence audit lists each native library and its licence, `LICENSE` holds the MIT text, `THIRD_PARTY_NOTICES.md` conveys the LGPLv3 text with the relink route, and the notice screen names the components and the source offer (TR-27).
  4. The automated journey runs green on the physical device, or its absence is reported with the manual checklist as substitute evidence (TR-23).
  5. A release build installs and completes a conversion; artifact sizes are recorded; no keystore is committed (TR-26).
  6. The merged manifest contains no `INTERNET` and no broad storage permission (TR-13).
  7. The README's feature list and requirements match what was actually verified â€” claims that could not be proven are removed or marked (TR-27, `Readme.md` [Unverified] items).
- **Verification:** accessibility pass with screenshots; `npx vitest run`; E2E run log; `assembleRelease`; `dumpsys package` permission dump; README review against the phase evidence.
- **Risks/blockers:** the licence audit can invalidate the release (if the bundled libraries impose terms the project cannot meet), which is why it is a stop condition rather than a checklist item; E2E tooling may simply not work on Windows.
- **Completion conditions:** all criteria evidenced, audit signed off by the owner, release candidate installed and used for one full conversion, final report published in the repository.

### Phase 8 â€” Persistent Results and Storage (approved; implementation in progress)

**Current status:** Approved by the owner on 2026-11-07 and under implementation. SQLite schema v1, a versioned migration runner, durable app-owned outputs, reconciliation, missing-file handling, and confirmed history/file actions are in source. Automated tests pass; native and phone checks remain open.

- **Objective:** Keep a useful, private conversion history and durable outputs across app restarts, with clear recovery and deletion behavior.
- **Scope:** Local SQLite conversion history; durable output files stored in app-owned storage; restart recovery that reconciles records with files and interrupted work; explicit missing-file states; user controls to clear history and delete app-owned output files. All records and media stay on-device and work offline. No account, sync, upload, analytics, or network dependency is introduced.
- **Dependencies:** Phase 2's output and cleanup contracts; Phase 4's queue/result identity and lifecycle; Phase 7's release, privacy, and data-retention review. The owner approved local offline implementation and explicit delete semantics on 2026-11-07. No retention limit is added; clearing is user initiated.
- **Deliverables:** versioned SQLite schema and migration path; storage boundary for durable app-owned outputs; restart reconciliation and interruption recovery; missing-file UI; separately clearable history and output-deletion controls with confirmed behavior; tests and device evidence.
- **Acceptance criteria:**
  1. Completed conversion records and their app-owned output files remain available after force-stop and relaunch, with metadata matching the converted result.
  2. Recovery marks interrupted jobs accurately and never reports an incomplete output as successful.
  3. If a recorded output is absent or unreadable, the history row clearly reports that state and offers only actions that can succeed; opening, sharing, and deleting it do not crash.
  4. Clearing history and deleting output files have explicit, separately understood effects; a user can remove one result and all associated app-owned bytes without touching files outside app storage.
  5. Versioned database migrations preserve valid history across an app upgrade; unsupported future schema versions fail safely without deleting database or output files.
  6. History and outputs remain available with networking disabled; the app adds no network permission or remote storage path for this feature.
  7. Automated tests cover persistence/restart reconciliation, migrations, missing files, individual deletion, clear-history behavior, and cleanup failures; physical-device checks confirm offline restart and storage behavior.
- **Verification:** SQLite repository and migration tests; application recovery tests with missing, partial, and valid files; Android restart/force-stop and offline checks; storage inspection proving app-owned placement and deletion boundaries.
- **Risks/open decisions:** low-space copy failure and device force-stop behavior need phone evidence. Missing/corrupt data must not trigger broad cache deletion; recovery only removes exact app-owned paths.
- **Completion conditions:** schema/migration and failure tests pass; offline restart and missing-file behavior are demonstrated on device; deletion scope is verified; remaining evidence is recorded separately from implementation. Phase 8 remains open until then.

## Change process

- Any new requirement is added to `prd.md` with a certainty label, then to `trd.md` if it has technical consequences, then scheduled in this plan â€” in that order, so work never exists only in a chat.
- Scope changes that contradict `mvp-scope.md` require the owner's explicit approval and a version bump in the affected documents.
- Discovered constraints that invalidate a decision (D1â€“D8, TD-1â€“TD-8) are recorded as a new decision with the evidence that forced it; the old decision is kept, not deleted, so the history explains itself.
- A phase that cannot meet its acceptance criteria is reported as incomplete. Criteria are never quietly relaxed to close a phase; if a criterion was wrong, it is changed explicitly and re-approved.

## Approval and handoff

Authorization: owner instruction received 2026-10-29 covering Phases 4â€“7 and outstanding earlier acceptance gaps, dependency installation, native builds/device installation when available, documentation, tests, and local phase commits. No push, publish, deploy, or release is authorized.





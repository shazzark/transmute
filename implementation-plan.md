# Implementation plan

> **Purpose:** Turn the drafted scope and requirements into bounded delivery phases with verification and completion conditions. **Related:** `prd.md` and `trd.md` define needs; `architecture.md` describes structure; `tasks.md` decomposes Phase 1.
>
> **Document rules:** `[Confirmed]`, `[Inferred]`, `[Recommended]`, `[Open question]` as defined in `project-brief.md`. Every phase below is **planned and unstarted**. No dates or estimates appear because none has been agreed; adding them requires the owner, not optimism.

**Status:** Draft | **Plan owner:** `shazzark` | **Scope/version:** `v0.1-mvp`

## Approved inputs and open decisions

Nothing is approved yet. The plan consumes these drafts: `project-brief.md` (why), `mvp-scope.md` (cut and priorities), `prd.md` (behavior), `trd.md` (testable requirements), `architecture.md` (structure and design system).

**Planning depth [Recommended]:** Standard mode plus a TRD. The project has one deployable component, so Advanced ceremony (risk register, ADRs, integration specs) is not justified; but the native-module integration, storage model, foreground service, licensing, and >1 GB handling each carry testable technical risk, which is exactly what a TRD is for. Deviations from the planning skill's document list, and why:

| Skill document | Decision |
|---|---|
| `design-system.md` | Folded into `architecture.md` as a section. The UI is four screens with one theme; a separate document would fragment a small set of tokens. |
| `testing-acceptance-plan.md` | Folded into `trd.md` ("Test strategy" + "Technical acceptance"). The acceptance criteria already live with the requirements they verify. |
| `appflow.md` | Not created. The primary journey is a single linear path documented in `architecture.md` ("Key flows"). |
| `risk-register.md`, `architecture-decision-record.md`, `external-integrations.md`, `database-schema.md` | Not created. Risks are carried in each phase; D1–D8 in `architecture.md` serve as lightweight decision records; there are no external integrations and no database. |

**Decisions that blocked Phase 1 — all answered 2026-10-27**

| ID | Question | Why it blocked |
|---|---|---|
| O-1 | Device and API level the work is verified on. **Answered 2026-10-27:** a physical Android phone over USB debugging, built and installed with `npx expo run:android --device <adb serial>`; the emulator is closed and out of the workflow. **Measured:** API 34 (Android 14), model SM-A135F, primary ABI `armeabi-v7a` | Phase 1 acceptance requires a real Android target with a hardware encoder; the >1 GB and background claims cannot be faked, and an emulator has no hardware encoder |
| O-2 | Whether `munim-ffmpeg` (Nitro module, Expo development build) runs unpatched under the New Architecture on the target. **Answered 2026-10-27:** proceed with `munim-ffmpeg@0.9.2`. A prebuild or build failure caused by the engine is recorded verbatim and stops the work; the documented fallback needs the owner's explicit approval | If it does not work, the whole plan changes, not just one phase |
| O-3 | Whether a small custom Kotlin SAF streaming module is acceptable. **Answered 2026-10-27: not needed for Phase 1** — `expo-document-picker` copies the selection into app cache and that path is FFmpeg's input. A custom Kotlin streaming module may return only if a >1 GB test proves the cache copy insufficient, in a later phase | It decided whether Phase 1 includes native code of our own; it now does not |
| O-6 | Audio default. **Answered 2026-10-27: MP3** for audio-only output, with MP4 video presets re-encoding audio to AAC | It changes the argv the Phase 1 tests assert |
| O-4 | Project licence. **Answered 2026-10-27: MIT** for the application code, with the LGPLv3 FFmpeg conveyed through `THIRD_PARTY_NOTICES.md` and `scripts/ffmpeg-build.md` | It decides what `LICENSE` says and what ships in the notice screen |

**Milestones (sequence, not dates)**

- **M1 — A real conversion works once** (Phase 1): a phone converts an MP4 offline and the file plays.
- **M2 — It survives real files** (Phase 2): >1 GB, low storage, cancel in every stage, no debris.
- **M3 — It survives real life** (Phase 3): screen off, app backgrounded, process killed.
- **M4 — It handles more than one file** (Phase 4): the queue.
- **M5 — It handles the advertised formats** (Phase 5): the matrix and audio extraction.
- **M6 — It handles subtitles** (Phase 6).
- **M7 — It is shippable** (Phase 7): accessibility, licence audit, E2E gate, release build.

Dependencies: M2 depends on M1; M3 depends on M2 (a service is only worth adding once the pipeline is stable); M4 depends on M3 (queue rows need the state machine to be trustworthy); M5 is independent of M4 and may run in parallel if the owner wants the format list sooner; M6 depends on M5's container support; M7 depends on all.

## Phases

### Phase 1 — Core vertical slice: pick, convert, save, with real progress

- **Objective:** Prove the riskiest thing first — that FFmpeg runs inside this app on a real Android target — and complete one honest end-to-end conversion.
- **Scope:** Scaffold an Expo SDK 58 app (blank TypeScript template) with `npx create-expo-app` at the repository root, preserving `Readme.md` and Git history; adopt continuous native generation with no committed `android/` directory and generate the native project with `npx expo prebuild`; configure the Android toolchain; integrate `munim-ffmpeg@0.9.2` + `react-native-nitro-modules` through the engine's config plugin and prove a smoke call from a development build; select a file with `expo-document-picker` (which copies it into app cache); probe it; convert to MP4 (H.264 + AAC); show progress from engine statistics; show success with the cache output path and failure with the engine's own message. **Excluded:** destination writing (Phase 2), multiple formats, queue, >1 GB optimisation, background service, subtitles, accessibility audit, licence screen, any native module written by this project.
- **Dependencies:** O-1 to O-6 (all answered 2026-10-27: physical phone, engine 0.9.2, `expo-document-picker` instead of a Kotlin module, MIT licence, MP3 default); Android SDK and a JDK exported in the shell. Measured 2026-10-27: `ANDROID_HOME` unset, no `java` on `PATH`, `JAVA_HOME` empty; the SDK is present with `adb.exe` at `C:\Users\chido\AppData\Local\Android\Sdk\platform-tools\adb.exe`, and Android Studio's JDK exists at `C:\Program Files\Android\Android Studio\jbr` and reports `openjdk 21.0.9`, so both need exporting in the session rather than installing; the verification target is the owner's phone over USB debugging, which `adb devices` now lists as `device` (API 34, `armeabi-v7a`), so the build gate is `npx expo run:android --device` with only that device attached and no emulator fallback. Two network-dependent setup steps belong to this phase: `npm install` fetches the engine's prebuilt FFmpeg libraries (checksum-verified, well over 100 MB across three ABIs) and the first `npx expo run:android` downloads Gradle dependencies plus the development client (`trd.md` constraint 7).
- **Deliverables:** a runnable debug app; `src/domain` with tested builders, encoder preference, and filename sanitiser; `src/native/ffmpeg.ts` as the thin engine adapter; the `expo-document-picker` intake adapter; a conversion screen wired to the conversion call; a short `Readme.md` update describing how to run it; recorded test output.
- **Acceptance criteria:**
  1. The app launches on the target and shows the idle state from `prd.md` PR-14.
  2. Picking a 30–60 second MP4 shows name, size, and duration (PR-01, PR-02).
  3. Convert writes an MP4 into the app cache (Phase 1 has no destination write), the path is shown, and a third-party player opens it; desktop `ffprobe` reports `h264` and `aac` (PR-03, PR-09, TR-02).
  4. The progress bar follows real statistics, never decreases, and reaches 100% before the success state (TR-04).
  5. Cancel during conversion ends in "Cancelled" with the job cache removed (TR-08, TR-11).
  6. An unsupported file and a file the provider refuses to copy each show their own message, never a bare "Error" (TR-30).
  7. Vitest covers the argv builder (happy path, invalid input, missing option, and the MP3/FLAC/OPUS target mapping), encoder preference (hardware then software then a specific error), and filename sanitising (separators, reserved characters, forced extension); adversarial names are asserted as full argv arrays (TR-03, TR-16, TR-22).
  8. `npx tsc --noEmit` is clean and the merged manifest contains no `INTERNET` permission (TR-01, TR-13).
- **Verification:** `npx vitest run`; `npx tsc --noEmit`; `npx expo run:android --device <adb serial>` (which runs the Gradle build, installs the development client, and launches the app on the phone — expect the first run to download the client and dependencies); manual device checklist with screenshots and the `ffprobe` output pasted into the phase report.
- **Risks/blockers:** the Nitro module may not register under the New Architecture in a prebuild-generated project (stop and report, do not patch blindly); the phone's encoder inventory is unknown until `listEncoders()` runs, so H.264 may resolve to the much slower `libopenh264` — and the target is a 32-bit `armeabi-v7a` device, so a software encode of even a 30-second clip may take minutes; record what `pickEncoder` actually selects instead of assuming the fast path, and keep the cable connected because a dropped USB connection aborts the install; the NDK/C++ build may fail on a Windows path with spaces or a long workspace path; the picker copies the whole file into cache, which is the cost Phase 2 measures; Gradle may target an unavailable JDK.
- **Completion conditions:** all eight acceptance criteria evidenced, test output and device checklist attached to the phase report, no uncommitted debugging code, and the owner's explicit approval to continue. **Stop conditions:** engine incompatibility after documented attempts; no Android target available; any required dependency whose licence would change the project's distribution terms.

### Phase 2 — Real files: streaming, space, cleanup, cancel everywhere

- **Objective:** Make the pipeline trustworthy for the files that matter — above 1 GB — and prove that no terminal path leaves debris.
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
- **Risks/blockers:** peak storage may exceed what a 1.2 GB test file allows on the device — then the check is done with the largest file the device supports and the limitation is reported; provider-specific write failures may make cleanup impossible (report, do not hide).
- **Completion conditions:** evidence for all six criteria; recorded peak memory and free-space mathematics; owner approval.

### Phase 3 — Background survival and interrupted jobs

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

### Phase 4 — Queue several files

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

### Phase 5 — Format matrix and audio extraction

- **Objective:** Deliver the advertised formats the build actually supports, without touching UI logic.
- **Scope:** Presets for MKV, WEBM, M4V/MOV containers and audio extraction to MP3, AAC, WAV, FLAC, OGG/OPUS; capability detection for codecs that are absent from the build; preset-aware validation (e.g. no audio stream → extraction disabled); documented support matrix. **Excluded:** subtitles, hardware encoders, size targeting, remux-only fast path.
- **Dependencies:** Phase 1 argv builder and preset model; Phase 2 pipeline; knowledge of which libraries the bundled `libmunimffmpeg.so` contains (TR-27 audit input).
- **Deliverables:** expanded preset catalogue with a test row per preset; support matrix in the README; disabled-state reasons in the selector.
- **Acceptance criteria:**
  1. Every enabled preset converts a fixture and desktop `ffprobe` confirms the requested container and codec (TR-18).
  2. Every advertised format appears in the README matrix as supported or explicitly unsupported with a reason — no silent gaps (`mvp-scope.md` non-goals).
  3. A preset that cannot apply is disabled with a visible reason and never falls back silently (TR-19).
  4. Audio extraction produces a playable audio file with the expected duration (±1 second of the source, allowing for encoder padding).
- **Verification:** one command-builder test per preset asserting the full argv; device conversion per enabled preset with `ffprobe` output recorded; manual playback of each result.
- **Risks/blockers:** the bundled binary may not include every advertised codec; the honest answer is a documented "unsupported", not a build hack. Some combinations are slow enough that the device test needs patience rather than a timeout bump.
- **Completion conditions:** matrix complete and truthful, tests per preset, owner approval.

### Phase 6 — Subtitles: embed and extract

- **Objective:** Handle subtitle tracks, the remaining advertised feature.
- **Scope:** Choose a sidecar subtitle file (SRT/ASS/VTT) and embed it into the selected container; list embedded subtitle tracks and extract one to SRT or VTT; validation of the sidecar before starting; naming and collision rules reused unchanged. **Excluded:** styling/burn-in of subtitles into the picture (a different, much slower operation), automatic language detection, subtitle editing.
- **Dependencies:** Phase 5 (a container matrix, because container subtitle support differs), Phase 2 pipeline; MP4 subtitle semantics need an explicit check — not all players display `mov_text` tracks.
- **Deliverables:** subtitle presets and validation; extraction-to-file path reusing the streaming writer; documented per-container subtitle support.
- **Acceptance criteria:**
  1. An SRT sidecar embedded into an MKV is selectable in a player and its text matches the source (PR-level behavior defined in `mvp-scope.md`).
  2. Extraction from a file with an embedded track produces a text file whose lines match the expected dialogue, with timestamps in the chosen format.
  3. A malformed sidecar is rejected before any copying starts, with a specific reason.
  4. MP4 subtitle behaviour is documented explicitly, including any player that ignores the track.
- **Verification:** device conversions with recorded `ffprobe` track listings and player screenshots; unit tests for sidecar validation and output naming.
- **Risks/blockers:** subtitle support varies by container and player more than any other feature; promising "subtitles work" without a per-container table would be misleading.
- **Completion conditions:** the per-container table is honest, device evidence exists for each claimed combination, owner approval.

### Phase 7 — Hardening and release readiness

- **Objective:** Make the app defensible: accessible, licensed, measured, and reproducible.
- **Scope:** Complete the error taxonomy; TalkBack pass and 200% scaling fixes; token-contrast test wired into the suite; licence audit and in-app notice screen; release build for `arm64-v8a` and `x86_64` with recorded sizes; E2E flow (Maestro or Detox) for pick → convert → save plus cancel; README rewritten to match verified capability; `Readme.md`'s unverified claims corrected. **Excluded:** CI pipeline, store listing assets, analytics, localization, light theme.
- **Dependencies:** Phases 1–6 as applicable to shipped features; O-4 (licence audit), O-5 (E2E tool).
- **Deliverables:** hardened build, audit document, notice screen, E2E flow, release artifacts, corrected README, final report.
- **Acceptance criteria:**
  1. TalkBack reads every control meaningfully; progress announces at phase change and completion; nothing is clipped at 200% text scale (TR-20).
  2. Token-contrast tests pass as part of `npx vitest run` (TR-20).
  3. The licence audit lists each native library and its licence, `LICENSE` holds the MIT text, `THIRD_PARTY_NOTICES.md` conveys the LGPLv3 text with the relink route, and the notice screen names the components and the source offer (TR-27).
  4. The automated journey runs green on the physical device, or its absence is reported with the manual checklist as substitute evidence (TR-23).
  5. A release build installs and completes a conversion; artifact sizes are recorded; no keystore is committed (TR-26).
  6. The merged manifest contains no `INTERNET` and no broad storage permission (TR-13).
  7. The README's feature list and requirements match what was actually verified — claims that could not be proven are removed or marked (TR-27, `Readme.md` [Unverified] items).
- **Verification:** accessibility pass with screenshots; `npx vitest run`; E2E run log; `assembleRelease`; `dumpsys package` permission dump; README review against the phase evidence.
- **Risks/blockers:** the licence audit can invalidate the release (if the bundled libraries impose terms the project cannot meet), which is why it is a stop condition rather than a checklist item; E2E tooling may simply not work on Windows.
- **Completion conditions:** all criteria evidenced, audit signed off by the owner, release candidate installed and used for one full conversion, final report published in the repository.

## Change process

- Any new requirement is added to `prd.md` with a certainty label, then to `trd.md` if it has technical consequences, then scheduled in this plan — in that order, so work never exists only in a chat.
- Scope changes that contradict `mvp-scope.md` require the owner's explicit approval and a version bump in the affected documents.
- Discovered constraints that invalidate a decision (D1–D8, TD-1–TD-8) are recorded as a new decision with the evidence that forced it; the old decision is kept, not deleted, so the history explains itself.
- A phase that cannot meet its acceptance criteria is reported as incomplete. Criteria are never quietly relaxed to close a phase; if a criterion was wrong, it is changed explicitly and re-approved.

## Approval and handoff

Status `Draft` v0.1 (2026-10-27). Approver: `shazzark` (repository owner), pending. Authorized starting phase: **none**. When implementation is approved, `engineering-workflow` takes over: repository checks, phase-sized changes, verification, and Git checkpoints. Until then, this plan is a proposal — no scaffolding, dependency installation, build, or commit is authorized by it.





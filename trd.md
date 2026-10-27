# Technical requirements document (TRD)

> **Purpose:** Define testable technical requirements, constraints, dependencies, and technical acceptance for Transmute. **Related:** `prd.md` owns product behavior; `architecture.md` owns structure, design decisions, and the MVP design system; `implementation-plan.md` sequences delivery.
>
> **Document rules:** `[Confirmed]`, `[Inferred]`, `[Recommended]`, `[Open question]` as defined in `project-brief.md`. All requirements are **planned and unimplemented**. Each names how it will be verified; a requirement without a check is a wish, not a requirement.

**Status:** Draft | **Technical owner:** `shazzark` | **Version:** 0.1

## Scope and links

Covers the whole app: the React Native shell, the FFmpeg binding, the storage gateway, the job pipeline, and the tests that prove them. Product behavior lives in `prd.md`; the MVP cut lives in `mvp-scope.md`. Nothing here covers a server, because there is none.

## Technical requirements

| ID | Requirement | Rationale | Priority/status | Acceptance and verification |
|---|---|---|---|---|
| TR-01 | RN 0.81.6 with New Architecture, TypeScript `strict`, and the RN template's default lint/format setup | Matches the declared stack; strict types catch nullable-metadata bugs | P0 [Confirmed stack, Planned setup] | `npx tsc --noEmit` reports no errors; `npm run lint` passes once configured; app boots on device |
| TR-02 | `ffmpeg-kit-extended` pinned to an exact version (registry latest `1.0.0`, published 2026-10-19) and consumed as a Turbo Native Module | Native ABI drift breaks builds silently; pinning keeps them reproducible | P0 [Confirmed available, integration Unverified] | A smoke call returns the engine version string, logged once, on a fresh install |
| TR-03 | FFmpeg is invoked with an argument array, never a concatenated shell string; paths are separate argv entries | User-controlled file names are untrusted input; shell interpolation is a command-injection path | P0 | Unit tests assert exact argv arrays for adversarial names (`-y`, `; rm -rf /`, spaces, quotes, unicode); no exec-style string API in the codebase |
| TR-04 | Progress derives from engine statistics: completion = processed output duration ÷ source duration, clamped 0–100 and monotonic within a job | The only trustworthy progress source; time-based estimates lie | P0 | Parser unit tests over real statistics fixtures (malformed lines, reset counters); device check that the bar hits 100% before the success state |
| TR-05 | Source bytes stream from the SAF URI into app cache in bounded chunks (≈1 MiB) with cancellation and byte progress; no whole-file buffer | A 1.2 GB read must not allocate 1.2 GB | P0 | Device run with a 1.2 GB input: no OOM, no ANR, cache copy size equals source size; cancel mid-copy leaves no file |
| TR-06 | Output bytes stream from cache into the destination URI in bounded chunks; failed or cancelled writes are cleaned up where the provider allows | Same memory bound on the way out; half-written files confuse users | P0 | Cancel during save leaves no zero/partial destination file on the internal-storage provider; a saved file is size- and hash-identical to the cache file |
| TR-07 | Before a job starts, the app estimates output size from input size and preset factor and requires that free space plus headroom; if short it refuses with a specific message | FFmpeg failing at 90% on a full disk wastes twenty minutes | P0 | Unit tests on the estimator per preset; device test below the threshold shows the refusal and starts nothing |
| TR-08 | Every job owns one cache subdirectory, removed on success, cancel, and failure; a startup sweep removes leftovers from earlier runs | Users must never pay storage for our debris | P0 | Cache size before and after each terminal state matches; a force-stop mid-conversion leaves a directory the next launch removes |
| TR-09 | Conversion concurrency is fixed at one; further jobs wait in a FIFO queue | Bounds memory, thermal load, and battery draw; parallel FFmpeg instances on a phone are slower in practice | P0 | Queue unit tests; a device run of three queued files shows strictly sequential execution |
| TR-10 | Conversions survive backgrounding through a foreground service with a progress notification and a cancel action; the service declares an explicit foreground service type | Users lock the phone mid-job; without a service Android kills the process | P0 [Inferred behaviour — verify against current Android docs in Phase 3] | Job started, app backgrounded and screen off for five minutes, completes; notification shows live progress; cancel from the notification stops the job; `adb shell dumpsys activity services` shows the declared type |
| TR-11 | Cancel is explicit and terminal: signal the engine, await exit briefly, clean up, report `cancelled`; double-cancel is idempotent | Users tap twice; a stuck "cancelling" state is indistinguishable from a hang | P0 | State-machine tests for cancel from every state; device cancel during conversion ends within seconds with no error dialog |
| TR-12 | On launch, any job recorded as running is marked `interrupted`, its cache cleaned, and the user told once | Process death must not leave a lying UI | P0 | `adb shell am force-stop` mid-job then relaunch: row shows "Interrupted", cache empty, no crash |
| TR-13 | The merged manifest declares no internet and no broad storage permission; only SAF, foreground service, and notification permissions appear | The privacy promise must be verifiable, not just stated | P0 | Inspect the merged manifest under `android/app/build/intermediates/merged_manifests/**` in Phase 7 and assert the permission set in the phase report |
| TR-14 | The app performs no network requests of any kind: no telemetry, crash reporting, remote fonts, or CDN assets | Same promise; also keeps the app functional offline | P0 | Code review of dependencies plus the manifest check (TR-13); no HTTP client in the dependency list |
| TR-15 | All file access is scoped: reads only from user-granted URIs, writes only to the chosen destination URI, temporaries only inside app cache | Scoped-storage compliance; prevents accidental writes elsewhere | P0 | Review of the storage gateway; device check that no other folder gains files |
| TR-16 | Output names are sanitised deterministically and collisions resolved with ` (2)`, ` (3)`; the source name is a template, never a path | Traversal and overwrite protection; predictable results | P0 | Table-driven unit tests: traversal (`../../etc/passwd`), separators, control characters, 255-byte names, emoji |
| TR-17 | Metadata comes from the engine's probe capability, with a documented fallback if probing fails; unknown duration is a supported state | Progress and validation depend on duration; some containers genuinely lack it | P0 | Parser unit tests over probe fixtures; device check that a file with unknown duration converts with indeterminate progress |
| TR-18 | Presets are data, not branches: each declares container, video codec and args, audio codec and args, extension, MIME type, and size factor | Adding formats must not touch UI logic | P0 (one preset) / P1 (matrix) | The preset catalogue type-checks exhaustively; one unit test per preset asserts its argv; Phase 5 device matrix |
| TR-19 | Unsupported source/preset combinations produce a specific error and never a silent fallback to another codec | Silent fallback produces files the user did not ask for | P0 | Validation unit tests; the UI shows the reason and keeps Convert disabled |
| TR-20 | Accessibility: every interactive element has a label and role, touch targets are at least 48 dp, progress is exposed as an accessibility value and announced politely (not every tick), text scales to 200% without clipping primary actions, and body text meets 4.5:1 contrast | The app is a utility used one-handed, often mid-task | P0 | Manual TalkBack pass; scaling behaviour checked at 200%; contrast ratios asserted by a unit test over the design tokens in `architecture.md` |
| TR-21 | Layering: pure domain logic (command building, parsing, naming, state machine, estimation) lives in modules with no React Native imports so it runs under Node | Native-dependent tests would need an emulator for logic that does not | P0 | A unit test imports the domain modules in plain Node with zero native mocks; review keeps RN imports out of `src/domain` |
| TR-22 | Unit tests run under Vitest and cover at minimum: argv per preset, statistics parsing, probe parsing, name/collision resolution, free-space estimation, error mapping, queue transitions | These are the failure modes that cause data loss or silent corruption | P0 | `npx vitest run` green locally; each module has at least one negative-path test (malformed input, cancellation, empty values) |
| TR-23 | End-to-end coverage of the primary journey on an Android target: pick → convert → save → visible success | Only a real device proves the pipeline works together | P1 [Open question: Maestro on Windows vs Detox] | One automated flow plus one cancellation flow; if neither tool runs on Windows, a scripted manual checklist with recorded evidence is the fallback |
| TR-24 | The UI thread is never blocked by conversion work; progress events throttled to at most two per second; batch lists virtualised | Prevents jank and notification spam | P0 | Review of the engine bridge (events emitted off-thread, throttled); profiler inspection while converting; no dropped-frame clusters attributed to the app |
| TR-25 | Logging is local only: job lifecycle events and engine exit codes, with full URIs truncated; no file contents, no personal metadata | Logs leak by default; keep them boring | P0 | Review of the logger adapter; no raw URI logging in the UI layer |
| TR-26 | Release packaging builds a signed release APK/AAB for `arm64-v8a` and `x86_64`, records the actual artifact size, and never commits keystores | Distribution needs real ABIs; committing secrets is unrecoverable | P1 | `assembleRelease` produces both artifacts; sizes recorded in the phase report; `git status` shows no keystore |
| TR-27 | The licence obligation is audited before public distribution: enumerate the shipped native libraries and codecs, ship the full GPL-3.0 `LICENSE`, and provide an in-app notice listing FFmpeg/ffmpeg-kit components and where corresponding source is offered | Bundling x264/x265 makes the distributed app GPL-3.0; shipping it while implying otherwise is a legal exposure | P0 (audit) / P1 (notice screen) | A written audit listing each native library and its licence; `LICENSE` present with the complete GPL-3.0 text; notice readable in the app |
| TR-28 | All user-visible strings live in one module, English only, with no concatenation that would break translation later | Cheap now, expensive to retrofit | P1 | Review: no literal UI copy outside the strings module |
| TR-29 | On Android 13+ the app requests notification permission once, when a conversion starts, and continues without it if denied | Permission prompts without context get permanently denied | P1 | Device run on API 33+: prompt appears with a rationale, denial still completes the conversion |
| TR-30 | Every failure carries a stable code and maps to a message with a recovery action; unknown engine failures surface the exit code in a Details expander | Users need to know whether to retry, free space, or pick another file | P0 | Table-driven unit tests over the error map, including an unmapped code falling back correctly; no path shows a bare "Error" |

## Constraints

1. **Platform floor:** Android 8.0 (API 26) minimum [Confirmed, `Readme.md`]. Behaviours that differ at API 26, 29 (scoped storage), 33 (notification permission), and 34 (foreground service types) must each be handled explicitly; the test plan names which API level exercises which behaviour.
2. **Stack ceiling:** React Native 0.81.6 with New Architecture; no Expo, no additional styling or state-management dependency without an approved reason. The app is small enough that custom hooks and context are sufficient.
3. **Single process, single job:** conversion concurrency is one; no worker pool, no WorkManager-driven scheduling in the MVP.
4. **Storage:** app cache is the only writable scratch space; everything user-visible goes through SAF.
5. **No network stack:** no HTTP client dependency, no remote assets, no update checks.
6. **Licensing:** the distributed binary is GPL-3.0 because of the bundled codecs; the repository ships the full licence text, and the audit in TR-27 must complete before any public build is published.
7. **Environment:** Windows development host, Node 22.13.0, npm 11.1.0; Android SDK at `C:\Users\chido\AppData\Local\Android\Sdk` with platform `android-36.1` and system image `android-37.0`; `ANDROID_HOME`/`ANDROID_SDK_ROOT` unset; no `java` on `PATH` and `JAVA_HOME` empty, with Android Studio's bundled JDK at `C:\Program Files\Android\Android Studio\jbr` [Confirmed, measured 2026-10-27]. Phase 1 must make the toolchain reproducible (JDK path pinned, `ANDROID_HOME` exported per session or via `local.properties`) before any build claim is trusted. Note that the React Native 0.81 Gradle setup may require a specific JDK version; the bundled JBR version must be checked, not assumed [Open question].
8. **No CI in the MVP:** all checks run locally and their output is recorded in phase reports. A CI pipeline is a later candidate, not a promise.

## Dependencies

| Dependency | Version/evidence | Licence | Usage and fallback |
|---|---|---|---|
| `react-native` | 0.81.6 [Confirmed: registry version exists; `Readme.md` requires 0.81.6+] | MIT | App shell. No fallback: the stack choice is fixed by the brief. |
| `ffmpeg-kit-extended` | 1.0.0, published 2026-10-19, peer `react-native >= 0.81.6` [Confirmed registry metadata, 2026-10-27] | npm metadata says `LGPL-2.1-or-later`; **bundled codecs (x264/x265) are GPL** [Open question: audit required, TR-27] | Conversion engine and probe. Fallback: another FFmpeg binding or a self-built AAR — both are large changes that would reopen the brief. |
| `@react-native-documents/picker` | 12.0.3, MIT, peer `react-native >= 0.79.0` [Confirmed registry metadata] | MIT | Source and destination selection. Fallback: platform `ACTION_OPEN_DOCUMENT` intent through a tiny custom module. |
| `vitest` | 5.0.5 available in this environment [Confirmed registry] | MIT | Unit tests. Fallback: Jest (RN default) if Vitest's Node-only constraints fight RN transforms. |
| Maestro CLI **or** Detox | Not installed; Maestro's Windows support is unverified [Open question] | Apache-2.0 / MIT | E2E. Fallback: scripted manual checklist with recorded evidence (TR-23). |
| Android SDK + JDK | SDK present at `C:\Users\chido\AppData\Local\Android\Sdk` (platform `android-36.1`), `ANDROID_HOME` unset; no `java` on `PATH`; Android Studio JDK at `C:\Program Files\Android\Android Studio\jbr` [Confirmed, measured 2026-10-27] | — | Builds. Fallback: none; this is a hard prerequisite, and the JDK version must be verified against the Gradle requirement rather than assumed. |

**Assumptions in this table that must be proven in Phase 1:** that the engine's Turbo Module registration works under New Architecture without patching; that its API exposes execute-with-arguments, cancellation, statistics callbacks, and a probe entry point; and that the built AAR's bundled codecs match the advertised format list. Any of these failing is a stop condition, not something to work around silently.

## Technical acceptance

Cross-cutting checks, each tied to requirement IDs and to evidence that can actually be produced:

| Area | What must hold | Requirement IDs | Evidence |
|---|---|---|---|
| Security and privacy | No network capability; no broad storage permission; user-controlled strings never reach a shell or a filesystem path unvalidated; temporaries confined to cache | TR-03, TR-13, TR-14, TR-15, TR-16 | Merged-manifest inspection, dependency review, adversarial-name unit tests, code review of the storage gateway |
| Reliability and recovery | Every job ends in exactly one terminal state; cancel works from every state; process death leaves no debris and no lying UI; low storage is refused before work starts | TR-07, TR-08, TR-09, TR-11, TR-12, TR-30 | State-machine unit tests, force-stop and cancel device runs, cache-size comparisons |
| Performance and responsiveness | Bounded memory for 1 GB+ inputs; UI thread free of conversion work; progress throttled | TR-05, TR-06, TR-24 | Device run with a 1.2 GB file, profiler inspection, event-rate assertion in a unit/integration test |
| Compatibility | API 26 floor, API 33 notification permission, API 34 foreground service typing; SAF-only access across providers | TR-10, TR-13, TR-29 | Device/emulator runs at the named API levels, provider-specific save test (internal storage, SD card if available) |
| Accessibility | Labels, roles, 48 dp targets, 200% scaling, 4.5:1 contrast, polite progress announcements | TR-20 | Manual TalkBack pass, scaling screenshots, token-contrast unit test |
| Licensing | Full GPL-3.0 text in the repository, audited native library list, in-app notice | TR-27 | Audit document, `LICENSE` inspection, notice-screen review |

### Test strategy

The strategy follows the principle that a test must be able to fail for a reason a user would feel. Three automated levels, plus a manual pass, each with a job the others cannot do:

| Level | Tool and location | What it covers | What it does not prove |
|---|---|---|---|
| Unit (fast, no device) | Vitest, `src/domain/**/__tests__` and `src/ui/__tests__` | FFmpeg argv construction for every preset, argument-injection resistance, statistics and probe parsing, output-name sanitisation and collision rules, free-space estimation, error mapping, queue state transitions, token contrast ratios | Anything about Android, SAF, the native module, or real media files |
| Adapter contract tests (fast, no device) | Vitest with fake ports (`src/services/**/__tests__`) | That the job pipeline calls the right port methods in the right order, that cancellation short-circuits, and that cleanup runs on every terminal path | That the real Android implementations behave the same way |
| End-to-end (device or emulator) | Maestro (preferred) or Detox; flows under `e2e/` | The primary journey — pick a fixture, convert, save, see success — plus cancel and one failure path | Code paths outside the flow, performance, unusual providers, or API-level-specific behaviour |
| Manual device checks | Recorded checklist per phase | Large files, background survival, low storage, notification permission denial, TalkBack, 200% scaling, provider variation | Repeatability; this is evidence, not a regression net |

**Command-builder tests are the centre of gravity.** They are deterministic, fast, and cover the highest-consequence failure (a malformed command that corrupts output or reaches a shell). Every preset ships with a table of cases: ordinary name, name with spaces, name with quotes, name starting with `-`, name with `../`, non-Latin characters, and a 200+ character name. Each case asserts the complete argv array, not a substring.

**Fixtures.** Small media samples are generated locally rather than committed, so the repository stays free of binary weight: a 5-second H.264/AAC MP4 and a short audio file via desktop FFmpeg, plus a large file assembled by concatenation for the >1 GB checks. The generation commands live in the repository as a documented script when Phase 1 begins; the fixture directory is ignored by Git.

**Reporting.** Every phase report states separately which tests were written, which were executed, their pass/fail result, and which could not run (and why). A green unit suite is not evidence that the app works on a phone; this document does not treat it as such.

## Open technical decisions

| ID | Decision | Options | Impact if unresolved | Needed by |
|---|---|---|---|---|
| TD-1 | How SAF bytes reach FFmpeg | (a) copy into app cache, convert, copy out; (b) native file-descriptor passing (`/proc/self/fd/N`) | (a) costs up to 2× peak storage and extra I/O; (b) is unverified on this engine and may not survive Android sandboxing | Phase 1 (choose (a) for MVP; revisit in Phase 2 only with device evidence) |
| TD-2 | Where the job runs when the app is backgrounded | (a) foreground service owned by a native module; (b) WorkManager with a foreground notification | (a) keeps live progress and cancel simple; (b) adds persistence and scheduling semantics the MVP does not need | Phase 3 |
| TD-3 | Probe implementation | (a) engine probe entry point; (b) `MediaMetadataRetriever` via native module | (a) reports containers the OS player cannot; (b) needs another native call but is fast and always present | Phase 1 (choose (a) with (b) as fallback) |
| TD-4 | E2E tool | Maestro vs Detox on a Windows host | Without one, the automated journey gate in TR-23 cannot run | Phase 7 (single flow, so the switch cost is low) |
| TD-5 | Test runner | Vitest vs Jest | Vitest is declared in `Readme.md` and fits the pure-domain design; Jest is the RN default with better RN-transform support | Phase 1 (choose Vitest; keep domain modules Node-clean so the decision stays reversible) |
| TD-6 | Job state persistence | In-memory only vs a small JSON file in app storage | Recovery (TR-12) needs at least a "was running" marker; a full database is unnecessary | Phase 3 |

## Approval and change history

| Version | Date | Change | Status |
|---|---|---|---|
| 0.1 | 2026-10-27 | Initial draft: 30 requirements, constraints, dependencies, acceptance matrix, test strategy | Draft, unapproved |

Approvers: `shazzark` (owner). Remaining conditions: Phase 1 must confirm TD-1, TD-3, and TD-5 with evidence — a passing unit suite alone does not settle them. Component diagrams live in `architecture.md`; there are no external provider flows to document because the app has no integrations.







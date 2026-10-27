# Delivery tasks

> **Purpose:** Break Phase 1 of `implementation-plan.md` into small, checkable work items. **Related:** `implementation-plan.md` owns phase order and completion; `prd.md`/`trd.md` own requirements. This list does not replace requirements or approval.
>
> **Document rules:** `[Confirmed]`/`[Inferred]`/`[Recommended]`/`[Open question]` as defined in `project-brief.md`. All tasks are **planned**; nothing here is started. Status stays `Draft` until the phase is approved.

**Status:** Draft | **Phase:** 1 — Core vertical slice | **Owner:** `shazzark`

## Phase objective and links

Objective: one honest end-to-end conversion on a real Android target — pick a file, convert to MP4 (H.264 + AAC), watch real progress, save to a chosen folder, cancel cleanly — with the risky logic proven by fast tests.

Source requirements: PR-01, PR-02, PR-03, PR-04, PR-05, PR-06, PR-07, PR-08, PR-09, PR-12, PR-14; TR-01 to TR-08, TR-11, TR-13, TR-16, TR-17, TR-18, TR-21, TR-22, TR-24, TR-30. Acceptance criteria are the eight items in `implementation-plan.md` Phase 1.

## Tasks

| ID | Work item | Deliverable | Dependencies | Acceptance/check | Owner/status |
|---|---|---|---|---|---|
| T-01 | Confirm the three blocking decisions: target device (O-1), engine approach (O-2), SAF module approval (O-3), audio default (O-6) | Recorded answers in the phase report | Owner availability | Written decisions, no "TBD" left in Phase 1 | `shazzark`, planned |
| T-02 | Scaffold RN 0.81.6 TypeScript app into this repository without losing `Readme.md` or Git history (init in a temp directory, move files, keep the existing remote) | App boots; `.gitignore` in place | T-01 | `git log` still shows the initial commit; app launches | planned |
| T-03 | Make the Android toolchain reproducible: point `JAVA_HOME`/`PATH` at `C:\Program Files\Android\Android Studio\jbr` (or an installed JDK that satisfies the Gradle version), export `ANDROID_HOME`, provide `local.properties` locally (never committed), and record the resolved Java version in the phase report | Green `assembleDebug` | T-02 | `.\gradlew.bat assembleDebug` succeeds from a clean shell; resolved Java and Gradle versions recorded | planned |
| T-04 | Add `ffmpeg-kit-extended` at an exact version and prove registration under New Architecture with a version-string smoke call | Logged engine version; documented API surface (execute, cancel, statistics, probe) | T-03 | Version string printed once on a fresh install; no manual linking hacks | planned |
| T-05 | Write the custom Kotlin storage gateway: read display name/size, stream URI → cache, stream cache → URI, byte progress, cancellation | Native module + typed TS adapter | T-04 | A 200 MB file copies in and out with correct size and hash; cancel leaves nothing | planned |
| T-06 | Domain: preset catalogue (one MP4 preset) and argv builder, pure and dependency-free | `src/domain/presets`, `src/domain/ffmpegCommand` | T-02 | Unit tests assert full argv arrays incl. adversarial names | planned |
| T-07 | Domain: statistics parser and probe parser with fixtures captured from the real engine | `src/domain/progress`, `src/domain/probe` | T-04 | Malformed and reset-counter fixtures handled; no `NaN` reaches the UI | planned |
| T-08 | Domain: output-name sanitiser, collision resolver, path policy, free-space estimator | `src/domain/naming`, `src/domain/space` | T-02 | Table-driven tests: traversal, separators, control characters, 255-byte names, emoji | planned |
| T-09 | Application: job pipeline and state machine (preparing → copying → converting → saving → terminal) with cleanup on every terminal path | `src/application/convertJob` | T-05 to T-08 | Fake-port tests: terminal state reached from every failure, cleanup exactly once | planned |
| T-10 | UI: conversion screen with `FileSummaryCard`, `PresetSelector`, destination line, `ProgressPanel`, sticky primary action, cancel dialog | Screen wired to the pipeline using tokens | T-09 | PR-01/05/07/08/14 states visible on device; no literal colours in components | planned |
| T-11 | Success and failure states: output name and folder, "Open" intent, error banner with recovery action and Details expander for exit codes | Error mapper + success panel | T-09 | PR-09/PR-12 pass; no bare "Error" string anywhere | planned |
| T-12 | Vitest configuration and npm scripts (`test`, `typecheck`), plus fixture-generation instructions that do not commit binaries | `vitest.config.ts`, scripts, README section | T-02 | `npx vitest run` and `npx tsc --noEmit` both green from a clean checkout | planned |
| T-13 | Device verification pass: the eight Phase 1 acceptance criteria, with `ffprobe` output, cache-size checks, and screenshots | Recorded checklist in the phase report | T-10, T-11, T-12 | Every criterion has attached evidence, including one failure case and one cancel | planned |
| T-14 | Phase review and handoff: report what was written/run/passed/not run, update `Readme.md` status if warranted, request approval | Phase report; no unreviewed leftovers | T-13 | Owner approval recorded before Phase 2 starts | planned |

## Completion and verification

Phase 1 closes only with all of the following evidence in one report:

1. **Commands run and their output:** `npx vitest run` (count of files/tests, pass/fail), `npx tsc --noEmit`, `.\gradlew.bat assembleDebug`, `npx react-native run-android`.
2. **Device checklist:** each of the eight acceptance criteria marked pass/fail with the observation that supports it (screenshot name, `ffprobe` output, cache size before/after).
3. **Failure and cancel evidence:** one unsupported file, one revoked grant, one cancel during conversion.
4. **Manifest evidence:** the permission set from the merged manifest, showing no `INTERNET` entry.
5. **Honest gaps:** anything not run, not reproducible, or skipped — stated plainly rather than implied to work.
6. **Owner approval:** recorded before any Phase 2 work begins.

Not accepted as completion evidence: a green unit suite alone, a build that compiles without running, or a screenshot without the corresponding device state.

## Optional sections

**Risk and blocker links**

| Risk | Where it is tracked | Mitigation |
|---|---|---|
| Engine does not work under New Architecture | T-04 stop condition | Stop and report with the build log; do not patch a third-party AAR blindly |
| No Android target available | T-01 | Ask the owner for a device or an emulator image; do not substitute desktop simulation |
| Windows toolchain friction (paths, JDK, NDK) | T-03 | `local.properties`, short workspace path, JDK 17 pinned |
| Vitest cannot transform a module under test | T-12 | Keep the domain layer Node-clean (TR-21); fall back to Jest only if the pure-domain option fails |

**Documentation handoff**

`Readme.md` is the only existing project document; it is updated after Phase 1 with real run instructions and its feature list is corrected to match verified capability. Planning documents are updated when scope changes, not silently.

## Related documents and approval

Links: `implementation-plan.md` (phase definition and completion), `prd.md` (PR-01 to PR-14), `trd.md` (TR-01 to TR-30, test strategy), `architecture.md` (components, D1–D8, design tokens).

Approval: none recorded. Phase 1 is not authorized to start. The owner must approve the phase, answer O-1/O-2/O-3/O-6, and explicitly permit scaffolding and dependency installation — planning approval alone does not.


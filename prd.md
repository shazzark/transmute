# Product requirements document (PRD)

> **Purpose:** Describe what Transmute must do from the user's side, including rules that must hold every time. **Related:** `project-brief.md` explains context; `mvp-scope.md` defines the cut; `trd.md` owns technical constraints; `implementation-plan.md` sequences delivery.
>
> **Document rules:** `[Confirmed]`, `[Inferred]`, `[Recommended]`, `[Open question]` as defined in `project-brief.md`. The owner authorized this MVP implementation on 2026-10-29. Acceptance criteria remain evidence gates; check `implementation-plan.md` for phase results.

**Status:** Authorized; requirements are being implemented and verified | **Owner:** `shazzark` (product decision owner) | **Version:** 0.1

## Problem and goals

Transmute lets an Android user convert media that is already on the phone into a format other players accept, entirely offline. This document covers the MVP defined in `mvp-scope.md` (`v0.1-mvp`), plus the behaviors needed for the product to be trustworthy: honest progress, predictable file names, no source damage, and a specific explanation for every failure.

Goals: the user finishes a conversion without training; the app never leaves debris or doubt about what happened; nothing leaves the device.

## Users and permissions

- **Single local user.** There are no accounts, roles, or sharing, so no authorization model exists beyond Android's own grants.
- **Permissions the product may request:**
  - File access only through the system document UI the user drives — one pick per file, and (from Phase 2) one folder choice for output. No `READ_EXTERNAL_STORAGE`, no `WRITE_EXTERNAL_STORAGE`, no `MANAGE_EXTERNAL_STORAGE` [Recommended].
  - `POST_NOTIFICATIONS` on Android 13+ so the progress notification is visible [Recommended; detail in TR-29].
  - No internet permission at all — a product promise, not only a technical choice.
- The app stays usable if a user denies notifications: conversion still works, only the notification is missing.

## In-scope behavior

### PR-01 Select a source file

- **Requirement:** The user taps "Choose file", the system document picker opens filtered to video and audio, and the chosen item becomes the current source. Cancelling the picker leaves the previous state untouched. `expo-document-picker` copies the chosen item into the app cache and hands back a local path plus its display name, size, and MIME type; that cached copy is what the app reads, so no `content://` URI or raw filesystem path is ever used as the conversion input.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given the idle screen, when the user picks a video and confirms, then the app shows the file name and size plus either a duration or the text "Duration unknown". Given the picker is cancelled, when the user returns, then the previous selection is still shown and no job starts.
- **Related journey/dependency:** Phase 1; `expo-document-picker` (copies into cache; TD-1).

### PR-02 Show what was selected, and refuse unreadable input early

- **Requirement:** After selection the app reads basic metadata (name, byte size, duration, container/codec when available). If metadata cannot be read, or the type is unsupported by the installed build, the app says so immediately and disables "Convert" instead of failing later.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a file the engine cannot probe, when it is selected, then an inline error names the reason and Convert is disabled. Given a valid file, when it is selected, then Convert stays in a loading state until probing finishes.
- **Related journey/dependency:** PR-12 error taxonomy; TR-17.

### PR-03 Choose the output format

- **Requirement:** The user selects one output preset from a short list. The MVP ships a single preset, "MP4 (H.264 + AAC)", but the selector exists so later phases add formats without redesign. Each preset states container, video codec, and audio behavior in plain words.
- **Priority/status:** P0 (single preset), P1 (matrix), authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a selected file, when the screen opens, then the MP4 preset is preselected and its summary is readable without jargon. Given a preset that cannot apply (e.g. audio extraction from a video with no audio stream), then that preset is disabled with a visible reason.
- **Related journey/dependency:** Phase 1 (one preset), Phase 5 (matrix); TR-18, TR-19.

### PR-04 Output naming and collision rules

- **Requirement:** The default output name is `<source base name> - converted.<ext>`, sanitised for the destination filesystem. An existing file is never overwritten: the app appends ` (2)`, ` (3)`, and so on. The source file is never modified, renamed, or deleted.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a source `Trip 2026.07.14.mp4`, when the conversion succeeds, then the default output is `Trip 2026.07.14 - converted.mp4`. Given that name already exists, when the job finishes, then the new file is `Trip 2026.07.14 - converted (2).mp4` and the earlier file is byte-identical to before. Given a source name containing `/`, `:`, newlines, or a leading dash, when the job runs, then none of those characters reach the output name and the conversion still succeeds.
- **Related journey/dependency:** TR-16; unit tests in Phase 1.

### PR-05 Choose the destination and remember it for the session

- **Requirement (Phase 2):** Before the first conversion the user picks a destination folder through the system directory picker; the choice is remembered for the app session so later jobs do not re-ask. The chosen folder is shown as text on the conversion screen with a way to change it. **Phase 1 has no destination write** (O-3, 2026-10-27): the result stays in app cache and the success state shows its path.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given no destination has been chosen, when the user taps Convert, then the directory picker opens instead of starting a job. Given a destination was chosen earlier in the same session, when a second job starts, then it saves there without asking again. Given the user changes the folder, when the next job runs, then the new folder is used and displayed.
- **Related journey/dependency:** Phase 2 (not Phase 1); [Open question] whether the picker can be pre-filled with the source file's parent folder.

### PR-06 Start preconditions

- **Requirement:** Convert is enabled only when a source is probed successfully and a preset applies; from Phase 2 it also requires a destination. Before the job starts, free space is checked against the estimated output size plus headroom; the job refuses to start when storage is insufficient.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a file whose estimated output would not fit, when Convert is tapped, then a message states the shortfall and nothing is copied or converted. Given a file that fits, when Convert is tapped, then the job enters its first visible state immediately (no silent pause).
- **Related journey/dependency:** TR-07; PR-12.

### PR-07 Progress, elapsed time, and estimate honesty

- **Requirement:** A running job shows a phase label ("Preparing", "Converting", "Saving"), a percentage, elapsed time, and — only when a stable estimate exists — remaining time. Percentage is derived from the engine's reported position relative to source duration and never decreases within a job. When duration is unknown, the bar is indeterminate and shows only elapsed time.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a conversion in progress, when statistics arrive, then the percentage increases and matches the phase (Preparing/Saving show their own progress, not the conversion percentage). Given a source with unknown duration, then no percentage or time-remaining is invented. Given the app is backgrounded and returns, then the displayed progress is current, not frozen at the value before backgrounding.
- **Related journey/dependency:** TR-04, TR-17; Phase 1.

### PR-08 Cancellation

- **Requirement:** Cancel is available while copying, converting, and saving. It asks for confirmation once, then stops the job, deletes temporary data, and leaves the source and destination unchanged.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a running job, when the user confirms Cancel, then the row ends in state "Cancelled", the cache holds no file for that job, and nothing new appears in the destination folder. Given the user dismisses the confirmation, then the job continues unchanged. Given Cancel is tapped twice, then no second dialog appears and no error is shown.
- **Related journey/dependency:** TR-08, TR-11; Phase 1 (conversion), Phase 2 (copy/save).

### PR-09 Completion, open, and share

- **Requirement:** A successful job shows the output name and its location. **Phase 1:** the location is the app cache path, shown as text, with no Open or Share action yet (a cache file has no shareable content URI). **Phase 2** adds the folder, then "Open" (hands the file to another app via the system viewer) and "Share". If no app can open the file, the app says so and still shows the location.
- **Priority/status:** P0 (success state and Open), P1 (Share), authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a completed job, when the user taps Open, then an external player receives the file; if none is installed, then a message names the folder instead of failing silently. Given the folder is shown, when the user reads it, then it matches the folder chosen in PR-05.
- **Related journey/dependency:** TR-06; Phase 1 (success state and path), Phase 2 (folder, Open, Share), Phase 3 (open from notification).

### PR-10 Background continuation

- **Requirement:** When the user leaves the app or locks the screen during a job, the conversion continues and a notification reports the current job and offers Cancel. Returning to the app shows current state without restarting the job.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a job started and the app backgrounded, when five minutes pass with the screen off, then the job has progressed or completed and the notification reflects reality. Given the user taps notification Cancel, then the job ends as cancelled and the app shows that state on return. Given notifications are denied, then the job still completes.
- **Related journey/dependency:** TR-10, TR-29; Phase 3.

### PR-11 Queue several files

- **Requirement:** The user can add several files at once from the picker. Jobs run one at a time in the order added. Each row shows its own state and progress; a queued row can be removed, a running row can be cancelled. There is no reordering in the MVP.
- **Priority/status:** P1, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given three selected files, when conversion starts, then exactly one row is "Converting" at any moment and the others show "Queued" with their position. Given the second row is removed while queued, then it never runs and its cache is empty. Given the first job fails, then the remaining jobs still run.
- **Related journey/dependency:** TR-09; Phase 4.

### PR-12 Failure taxonomy and recovery

- **Requirement:** Every terminal failure maps to one of a fixed set of causes, each with a plain-language explanation and a next step: not enough space, permission or grant revoked, unsupported media, engine failure (with exit code in a Details expander), interrupted by the system, and unknown. The app never shows a bare "Error".
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a job that fails because storage filled up, when it ends, then the message names storage and suggests freeing space, and the file can be retried without re-picking. Given a job killed by the system, when the app is reopened, then it reads "Interrupted" and explains that the job did not finish. Given an unmapped engine exit code, then the app shows the unknown bucket plus the code, and logs the mapping gap.
- **Related journey/dependency:** TR-30; Phase 1 (first four causes), Phase 3 (interrupted).

### PR-13 History

- **Requirement:** Completed, failed, and cancelled jobs remain visible for the current session only. There is no database and no cross-launch history in the MVP; the app starts empty each launch apart from interrupted-job reporting.
- **Priority/status:** P1 [Recommended], authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a finished job, when the app is closed and reopened, then no history rows are shown, and only an "interrupted" notice appears if a job was cut off.
- **Related journey/dependency:** PR-14; out of scope for persistence.

### PR-14 Idle and empty states

- **Requirement:** With no file selected, the screen explains in one sentence what the app does and shows a single primary action. No job rows, progress bars, or disabled forms are shown before there is something to act on.
- **Priority/status:** P0, authorized; acceptance evidence pending.
- **Acceptance criteria:** Given a first launch, when the screen appears, then exactly one primary action is visible ("Choose file") with a one-sentence explanation. Given no destination is chosen, then the destination line reads "Not chosen yet" rather than being blank.
- **Related journey/dependency:** Phase 1; design system states in `architecture.md`.

### PR-15 Navigation and session results

- **Requirement:** Home/Converter, Active Queue, Results, and Result Details are routable views. The queue controller stays mounted above route changes. Successful outputs appear in the current-process Results view with format, cache location, Save to Phone, and Share actions. History is in-memory only; no durable history database or stale cache-path persistence is added.
- **Priority/status:** P0, authorized; device acceptance pending.
- **Acceptance criteria:** Navigation while converting does not restart or duplicate the job; result rows appear after success; save, share, cancellation, and failure states are truthful; missing session results show an explanatory message.

### PR-16 Notification permission and completion links

- **Requirement:** Create the Android notification channel before the one-time startup permission request. Denial never blocks conversion and is explained in the UI. Successful all-complete batches post “Conversion Complete”; failed or mixed batches do not. Completion taps open `/results` whether the app is open, backgrounded, or cold-started; external destinations are allowlisted.
- **Priority/status:** P0, authorized; native device acceptance pending.
- **Acceptance criteria:** Verify permission and service behavior on Android; tap completion notifications in all three app states; ensure no duplicate navigation and no success notice for mixed outcomes.

## Out of scope

Everything listed under non-goals in `mvp-scope.md`, plus: resuming an interrupted conversion, converting in parallel, background work without a visible notification, and any behavior that depends on a server. Subtitle handling (embed/extract) is documented in `mvp-scope.md` as P2 and is not part of this PRD's acceptance until Phase 6 is approved.

## Product constraints and open questions

**Constraints**

- English-only copy at MVP; all strings centralised so translation is mechanical later.
- One-handed portrait use is the primary posture; landscape and 200% text scale must not break primary actions.
- No user data leaves the device; the app must not require any network state to function.
- Every destructive or long-running action has a visible state and a way out (cancel, retry, dismiss).

**Open questions**

1. Can the destination folder be pre-filled from the source file's parent folder, or must the user always pick? (`ACTION_OPEN_DOCUMENT_TREE` behaviour varies by provider.) [Open question]
2. Should the app offer "Remux only" (no re-encode) as a fast path for already-compatible files? Tempting for speed, but it multiplies preset states. [Recommended: no, until Phase 5 data justifies it]
3. Should output names be user-editable before saving? [Recommended: no for MVP — one less validation surface]
4. Is a session-only job list acceptable, or does the absence of history read as data loss? [Open question — only real users can answer]

## Optional sections

**Analytics and success measures**

None. The app ships no analytics and collects nothing. Success is evaluated through the manual device evidence described in `mvp-scope.md` and the phase reports in `implementation-plan.md`. Adding telemetry would contradict PR constraints and TR-14, so it is not a future candidate unless the product's privacy promise is explicitly renegotiated.

**Accessibility and content rules**

- Buttons describe the action ("Convert", "Choose folder"), never "OK"/"Submit".
- Error text names the problem, then the next step, in that order, and avoids codec jargon unless the user needs it to act.
- Time and percentage values use fixed-width numerals to avoid layout jitter while updating.

## Approval and change history

| Version | Date | Change | Status |
|---|---|---|---|
| 0.1 | 2026-10-27 | Initial draft from the README feature list and the architecture decisions in `architecture.md` | Historical draft; implementation authorized 2026-10-29 |

Authorization: owner instruction received 2026-10-29. This PRD states product intent; technical constraints are owned by `trd.md`. Acceptance evidence is incomplete as recorded in `implementation-plan.md`.





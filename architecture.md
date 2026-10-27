# Architecture overview

> **Purpose:** Describe the system's parts, boundaries, dependencies, and design choices — including the MVP design system, which is documented here instead of a separate document. **Related:** `trd.md` states testable requirements; `implementation-plan.md` phases delivery; `prd.md` owns product behavior.
>
> **Document rules:** `[Confirmed]`, `[Inferred]`, `[Recommended]`, `[Open question]` as defined in `project-brief.md`. All components below are **planned**; there is no code in the repository today. A diagram is a claim about intent, not proof of quality.

**Status:** Draft | **Architecture owner:** `shazzark` | **Version:** 0.1

## Context and drivers

Transmute is a single-device, offline Android application. The quality attributes that shape it, in order:

1. **Never lose or corrupt the user's media.** The source is read-only; outputs are written once and verified; debris is removed.
2. **Survive long jobs.** A 1 GB conversion may run for many minutes across screen locks and app switches. The design must assume the activity will be destroyed.
3. **Bounded memory on a phone.** Nothing may scale with file size.
4. **Minimum privilege.** Only SAF grants, plus notification permission for the progress notification.
5. **Testable logic outside Android.** Parsing and command building must be provable in Node, because device testing is slow and manual.

Constraints and open questions come from `trd.md`; the scope comes from `mvp-scope.md`.

## System boundary and actors

- **The user** — single local person, no account.
- **Android platform** — document picker, SAF providers (internal storage, SD card, cloud providers mounted as documents), notifications, foreground service lifecycle, media playback in other apps.
- **The FFmpeg engine inside the app process** — native code invoked through the RN bridge.
- **External systems: none.** No server, no API, no analytics endpoint, no crash reporting.

Not owned by Transmute: decoding capabilities of third-party players, the correctness of provider apps that serve SAF URIs, Android's process-killing policy, or the legal compliance of downstream forks (the GPL obligation transfers with the code).

**Trust boundaries.** Everything user-controlled crosses two boundaries: the SAF URI (untrusted provider, unknown size and metadata) and the filename string (untrusted text that reaches a native command line and a destination filesystem). Both are treated as hostile until validated.

## Major components and responsibilities

| Component | Responsibility and data owned | Calls or events | Failure and availability notes |
|---|---|---|---|
| **UI layer** (`src/ui`) | Screens, design tokens, presentational components. Owns no durable data; holds view state only | Calls application use cases; subscribes to job state | Must stay usable when a job fails; never blocks on native work |
| **Application layer** (`src/application`) | Orchestrates a job: preflight, copy-in, convert, copy-out, cleanup; owns the job state machine and the session queue | Calls domain functions and port interfaces | Every path must reach a terminal state and run cleanup exactly once |
| **Domain layer** (`src/domain`, pure TypeScript) | Preset catalogue, FFmpeg argv builder, statistics parser, probe parser, output-name resolver, path policy, free-space estimator, error mapper, queue reducer | Pure functions and reducers only | Deterministic; no I/O, no RN imports; fully unit-tested |
| **Ports** (`src/ports`) | Interfaces the application depends on: `MediaEngine`, `SourceFiles`, `DestinationFiles`, `Clock`, `Logger`, `Notifier`, `SpaceInfo` | Implemented by adapters; faked in tests | Keeping them narrow is what makes adapter tests cheap |
| **Engine adapter** (`src/services/mediaEngine`) | Wraps `ffmpeg-kit-extended`: execute with argv, stream statistics, cancel, probe | Events from native → application; argv from domain | Native crash or hang must surface as a failed job, never a frozen UI |
| **Storage gateway** (native Kotlin module + TS adapter) | Streams a SAF URI into cache and cache into a destination URI in bounded chunks, reporting bytes and honouring cancellation; resolves display name and size | Called by application layer | Provider may reject writes (read-only folder, revoked grant, full disk); must clean up partial output where possible |
| **Foreground service** (native Kotlin) | Keeps the process alive during a job, publishes a progress notification with Cancel, receives cancel from the notification | Started/stopped with job lifecycle | Android 14+ requires a declared service type; long jobs have daily limits that must be documented, not ignored |
| **Job store** (`src/application/jobStore`) | Session job list plus an "in progress" marker for crash recovery | Read at launch | MVP: in memory plus a marker; no database |

## Key flows

**1 — Select and validate.** `Pick file → SAF URI → gateway reads display name and size → engine probe → duration and streams → UI shows summary or a specific refusal`. Probing is the first real failure point, so it happens before any copying.

**2 — Convert (primary journey).** `Preflight (space, preset compatibility) → create job cache dir → stream source into cache with progress → build argv from preset + paths → execute, consume statistics, map to percent → on success stream output to destination URI → verify size/hash → delete cache → success state`. Every arrow can fail, and each failure routes through the error mapper before reaching the UI.

**3 — Cancel.** `User confirms → state "cancelling" → engine cancel or copy-abort → await terminal signal → delete cache dir → cancelled state`. Cancel is a first-class transition, not an exception path.

**4 — Interrupted.** `App killed → process restarts → job store sees the in-progress marker → mark interrupted, sweep cache, notify once`. The MVP reports interruption instead of resuming; resuming would require checkpointing FFmpeg state, which it cannot do.

## Decisions and trade-offs

| ID | Decision | Alternatives considered | Reason and cost |
|---|---|---|---|
| D1 | Copy SAF source into app cache, convert there, then stream the result to the chosen destination | Read the SAF file descriptor directly during conversion | Predictable filesystem paths keep the FFmpeg invocation simple and testable. Cost: up to 2× peak storage and doubled I/O for large files, so the free-space check must account for the peak, not just the output. Revisit only with device evidence (TR-05/06/07). |
| D2 | Sequential job execution, concurrency fixed at one | Parallel jobs, or a pool sized to CPU count | One FFmpeg instance already saturates the cores it can use; parallel instances add memory pressure, thermal throttling, and unpredictable progress. Cost: slower batches, which is acceptable for a queue of a few files. |
| D3 | Pure domain layer with port interfaces, adapters isolated at the edges | Logic inside components and native calls sprinkled through screens | Makes the highest-risk logic (argv, parsing, naming, transitions) unit-testable in Node without an emulator. Cost: a little indirection and discipline about imports. |
| D4 | A small custom Kotlin storage module instead of a bigger storage library | Third-party SAF streaming library | The picker returns URIs, not streams, and no confirmed dependency offers chunked copy with progress and cancellation. Cost: we own native code, including its Android-version edge cases. |
| D5 | Foreground service for the running job (TD-2 pending) | WorkManager, or no service at all | Interactive jobs need live progress and immediate cancel; WorkManager's guarantees are about eventual execution, not responsive control. Cost: notification permission flow and API 34 service typing. |
| D6 | Session-only job list, plus a persisted "in progress" marker | Database-backed history, or no persistence at all | History is a P1 nicety; crash recovery is a correctness need. Cost: the list is empty on relaunch, which some users may read as loss (PRD open question 4). |
| D7 | Presets as data, with one shared builder | A separate function per format | Adding formats becomes a data change with a test row, not new branching logic. Cost: the preset record must be expressive enough for subtitle and audio-extraction cases, which Phase 5/6 will pressure-test. |
| D8 | Full GPL-3.0 compliance with an in-app notice | Ship without the notice, or swap to LGPL-only FFmpeg builds | The bundled codecs are GPL, so compliance is not optional. Cost: a licence audit and an extra screen; removing x264/x265 would gut the feature list. |

## Evolution and compatibility

- **Storage strategy:** if device measurements show copy-to-cache is too slow or needs too much free space, the storage gateway interface can gain a streaming/fd mode without touching the domain layer. That is the intended seam (D1, TR-15).
- **Format growth:** the preset catalogue and argv builder absorb new containers and codecs; the UI reads presets and needs no change (D7).
- **Background work:** if Android's foreground-service limits become binding (Android 14+ daily caps for long-running types, or Android 15's media-processing type), the service implementation changes behind the same notification contract. The plan must record which behaviour was verified on which API level rather than assuming one rule for all versions.
- **Persistence:** moving from a marker to a real store is a local change behind `jobStore`; no schema exists yet, so nothing to migrate.
- **No data compatibility surface:** there are no files, formats, or APIs that other systems depend on, so versioning concerns are limited to the app's own installed base — of which there is none yet.

## Design system (MVP)

A small, dark-first system for four screens. It is defined here rather than in a separate document because it is one theme and a handful of components; the design-system skill's rules still apply — semantic tokens, behaviour defined with appearance, accessible by default, no component framework built for its own sake.

**Visual direction [Recommended]: "instrument panel".** The app is a tool that runs for minutes and is checked at a glance, so the interface behaves like a console rather than a marketing page: flat dark surfaces separated by 1 px borders, one accent colour reserved for the primary action, monospaced-feeling numerals for progress and elapsed time, and no gradients, illustrations, shadows, or decorative icons. This is a deliberate rejection of the generic "purple gradient + centered hero + emoji" default: nothing in it helps a user judge whether a 40-minute conversion is progressing. No brand identity exists in the repository, so this direction needs the owner's approval before it hardens.

**Theme scope:** dark only at MVP. A light theme is a later candidate; tokens are semantic so adding one does not require touching components.

### Colour tokens

| Token | Value | Role |
|---|---|---|
| `color.bg` | `#0E1116` | App background |
| `color.surface` | `#171C23` | Cards, rows, sheets |
| `color.surfaceRaised` | `#1F262F` | Pressed/hovered row, progress track |
| `color.border` | `#303844` | 1 px dividers and input outlines |
| `color.text.primary` | `#E6EDF3` | Primary copy, file names |
| `color.text.secondary` | `#98A2B3` | Metadata, timestamps, hints |
| `color.accent` | `#4C8DFF` | Primary action fill, links, active state |
| `color.accent.ink` | `#06131F` | Text/icons **on** the accent fill |
| `color.danger` | `#FF6B6B` | Errors, destructive confirmation |
| `color.warning` | `#F5C542` | Warnings (low storage, unsupported preset) |
| `color.success` | `#3DDC84` | Completed jobs |

**Contrast [Inferred, computed]:** ratios computed with the WCAG 2.x relative-luminance formula on 2026-10-27, not yet verified with a tool:

| Pair | Ratio | Verdict |
|---|---|---|
| `text.primary` on `bg` | ≈16.1:1 | Passes AA and AAA for normal text |
| `text.secondary` on `bg` | ≈7.4:1 | Passes AA and AAA for normal text |
| `accent` on `surface` | ≈5.4:1 | Passes AA for normal text; not AAA |
| `accent.ink` on `accent` | ≈5.8:1 | Passes AA — this is why primary buttons use dark ink rather than white |
| `danger` on `bg` | ≈6.9:1 | Passes AA |
| `success` on `bg` | ≈10.7:1 | Passes AA and AAA |
| `warning` on `bg` | ≈11.8:1 | Passes AA and AAA |

White text on `accent` would be ≈3.2:1 and fails for normal text; it must not be used. These pairs become a Vitest assertion over the token module (TR-20), so a future palette edit fails a test instead of quietly reducing readability. Colour is never the only carrier of meaning: every status also has a label.

### Type, spacing, shape, motion

| Token group | Values | Rules |
|---|---|---|
| Type scale | `caption 12/16`, `label 13/18`, `body 15/22`, `bodyLarge 17/24`, `title 22/28`, `display 30/36` (size/line-height, sp) | System font (Roboto on Android). Numeric readouts (`45%`, `02:13`) use `fontVariant: ['tabular-nums']` so they do not jitter. No font asset is bundled — it would add weight and a licence. |
| Font weight | 400 body, 500 labels, 600 titles | No weight 300 for text under 15 sp (thin text is hard to read on OLED at low brightness). |
| Spacing | 4, 8, 12, 16, 24, 32, 48 | 4-based scale; screen padding 16, section gap 24, row padding 12/16. Nothing is positioned with ad-hoc numbers. |
| Radius | `control 10`, `card 14`, `pill 999` | Consistent curvature; no mixed radii inside one surface. |
| Elevation | None | Depth comes from `surface` + 1 px `border`. Shadows on a dark theme read as smudges. |
| Motion | 120 ms for state changes, 200 ms for sheets | Progress fills animate only between reported values; no looping shimmer. When `AccessibilityInfo.isReduceMotionEnabled` is true, animation is removed rather than shortened. |
| Touch | Minimum 48×48 dp | Applies to the row overflow menu and the cancel icon, not only to buttons. |

### Components and required states

| Component | Purpose | States that must exist |
|---|---|---|
| `PrimaryButton` | The one commitment action per screen ("Convert", "Choose file") | default, pressed, disabled (+ reason), loading (spinner replaces label, width preserved), focus |
| `SecondaryButton` | Open, Share, Change folder, Cancel | default, pressed, disabled, loading |
| `FileSummaryCard` | Source name, size, duration, container/codec | empty (nothing chosen), probing (skeleton), ready, unsupported (danger border + reason) |
| `PresetSelector` | Output format choice | selected, unselected, disabled (+ reason), single-option |
| `ProgressPanel` | Phase label, bar, percentage, elapsed, ETA | indeterminate (unknown duration), determinate, stalled (no update for a while, still "working"), complete |
| `ProgressBar` | Visual progress | determinate, indeterminate, error (danger fill), success (success fill) |
| `JobRow` | One queued or finished job | queued (+ position), preparing, converting, saving, cancelling, done, failed (with cause), cancelled, interrupted |
| `Banner` | Inline message above the primary action | error, warning, info, success; dismissible where the message is not blocking |
| `EmptyState` | First launch, no file chosen | illustration-free: one sentence + one action |
| `ConfirmDialog` | Cancel a running job, overwrite-ish confirmations | default, destructive-confirm (danger), busy |

Every state above needs a place in the code (`variant`/`status` prop), not an ad-hoc conditional: this is the design-system skill's rule that behaviour is designed with appearance, and it is what makes the phase-level UI review possible.

**Copy rules.** Action labels are verbs that name the outcome. Errors state the problem, then the next step. No exclamation marks, no "Oops", no jargon unless it changes what the user does. Percentage and time never claim precision the engine cannot support — hence the ETA is hidden until an estimate exists.

### Layout and screen composition

- **Conversion screen (primary):** `FileSummaryCard` → `PresetSelector` → destination line ("Saving to: …", tappable) → `ProgressPanel` (only when a job exists) → sticky bottom `PrimaryButton`. Single column, 16 dp side padding, content max width 560 dp on large screens, safe-area insets respected so the sticky action never sits under the navigation bar.
- **Job list screen:** `JobRow`s, one line of metadata plus state, overflow menu per row; empty state when nothing has run.
- **Notice screen (Phase 7):** licence and component list, plain text, scrollable, no interactive surprises.
- **Confirmation sheet:** title, one-sentence consequence, destructive action right-aligned, cancel left.

Portrait is primary; landscape must not clip the sticky action or the `ProgressPanel` (they stack, they do not overlap). At 200% text scale, labels wrap and the sticky action remains fully visible — if that cannot be achieved with the current type scale, the scale is reduced rather than hiding the action.

### Accessibility rules (binding on components)

1. Every pressable has `accessibilityRole` and `accessibilityLabel` that include the object ("Convert Trip 2026.mp4", not "Convert").
2. Progress is exposed as `accessibilityValue` (min 0, max 100, now N) and announced politely at phase changes and at completion — not on every statistics tick.
3. Icons never carry meaning alone; the adjacent text says it.
4. `allowFontScaling` stays enabled; layouts use wrapping, not truncation, for anything a user must read to act.
5. Focus order follows visual order; the confirmation action is reachable last, not first.
6. Nothing relies on hover. Pressed and focused states are visible on touch and with a keyboard/D-pad.
7. Reduce-motion is honoured for all transitions.

### What this design does not claim

No Figma file exists, so nothing here is a pixel-matching handoff. No accessibility tool has been run, so the contrast numbers are computed mathematics and the rest is a checklist, not a conformance claim. No device has rendered these tokens, so spacing and type sizes are reasoned, not observed.

## Validation and approval

| Item | Evidence needed | Status |
|---|---|---|
| Storage strategy (D1) | A 1.2 GB conversion completing within measured free space, plus cache peak recorded | Not started |
| Foreground service behaviour (D5) | Device run at the lowest and highest available API levels, service type confirmed in `dumpsys` | Not started |
| Design tokens | Contrast assertions passing in Vitest; 200% scaling screenshots; TalkBack pass | Not started |
| Licensing (D8/TR-27) | Enumerated native library list with licences | Not started |

Approver: `shazzark` (owner), pending. Version 0.1, 2026-10-27. This document describes intent; no architectural claim here has been proven by a running system, because none exists.






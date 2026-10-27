# MVP scope

> **Purpose:** Define the smallest release that is genuinely useful and can be evaluated. **Related:** `project-brief.md` gives the why; `prd.md` defines selected behavior; `trd.md` states testable technical requirements; `implementation-plan.md` sequences the work.
>
> **Document rules:** `[Confirmed]`, `[Inferred]`, `[Recommended]`, `[Open question]` as defined in `project-brief.md`. Everything below is **planned** — no capability exists in code today. A proposed priority is not an approved priority.

**Status:** Draft | **Owner:** `shazzark` (repository owner) | **Release/cut:** `v0.1-mvp`

## MVP outcome

One user, one phone, no network: select a video from device storage, convert it to a playable MP4, watch honest progress, and save the result to a folder they choose — including files above 1 GB, and without the job dying when the app is backgrounded.

## Must-have capabilities

| Priority | Capability | User value | Acceptance signal | Dependencies/status |
|---|---|---|---|---|
| P0 | Pick a source file through the Storage Access Framework (video or audio) | Conversion without broad storage permission; the user keeps control | The chosen file's name and size appear, with duration or an explicit "unknown" | `@react-native-documents/picker` 12.0.3 [Confirmed available]; MIME filtering [Recommended] |
| P0 | Convert to MP4 (H.264 video, AAC audio) | The compatibility fix most users actually need | Output plays in a third-party player; desktop `ffprobe` reports `h264` + `aac` | `ffmpeg-kit-extended` 1.0.0 [Confirmed available; integration **Unverified**] |
| P0 | Live progress, elapsed time, and cancel | Long jobs become tolerable and reversible | Progress rises monotonically from real FFmpeg statistics and reaches 100% before success; cancel ends the job and removes its temporary output | Phase 1 |
| P0 | Save to a user-chosen SAF destination | Files land where the user looks for them | Output visible in the system Files app at the chosen folder | Streaming SAF writer [planned custom native module — [Open question]] |
| P0 | A specific message and recovery action for every terminal failure | Users know what happened and what to do | No failure path ends in a silent no-op or a generic "error" | Error taxonomy (TR-30) |
| P0 | Large-file handling above 1 GB | The headline promise most converters break | A 1.2 GB input completes with no out-of-memory kill and no ANR; cache returns to pre-job size | Streaming copy (TR-05/06), free-space preflight (TR-07) |
| P0 | Background survival (foreground service + notification) | Locking the phone must not destroy the job | Job completes with the screen off and the app backgrounded; the notification shows progress and offers cancel | TR-10, TR-29 |
| P0 | No network permission at all | Makes the privacy promise checkable | The merged manifest declares no `INTERNET` permission | TR-13, TR-14 |
| P1 | Format matrix: MKV, WEBM, M4V/MOV containers and audio extraction (MP3, AAC, WAV, FLAC, OGG/OPUS) | Covers the rest of the advertised use cases | Each preset converts a fixture and `ffprobe` confirms the requested container and codec | Phase 5 |
| P1 | Sequential batch queue | Real usage is three to ten files, not one | Files process FIFO, one at a time, each row reporting its own state | Phase 4 |
| P2 | Subtitle embed and extract (SRT/ASS/VTT) | Listed in `Readme.md`; smaller audience | The embedded track is selectable in a player; extracted text matches the source | Phase 6 |

**Sequence versus priority.** Phases are ordered by risk, not by priority label: the native-module integration, the large-file pipeline, and background survival are the parts most likely to fail, so they come first. Every P0 row is release-gating regardless of the phase that delivers it.

## Explicit non-goals

- iOS, web, and desktop clients; any backend, account, cloud sync, or telemetry.
- Video editing: trimming, cropping, filters, watermarks, timelines, frame previews, thumbnails.
- In-app playback of results (results open in an external player).
- DRM-protected content, screen recording, live camera capture.
- Share-sheet intake from other apps (a strong later candidate, not MVP).
- Hardware encoder tuning (`MediaCodec`), two-pass size targeting, benchmark or batch-automation modes.
- Persistent history or a database; job resumption after process death (an interrupted job is reported as interrupted, not resumed).
- Localization, light theme, tablet-specific layouts, RTL polish.
- Guaranteed decoding of all ten advertised input containers. Phase 5 ships the formats the build actually supports and documents the rest as unsupported instead of shipping them broken.

## Later candidates

Share-sheet intake; resumable jobs; hardware encoders; per-file presets; output-size targeting; subtitle burn-in styling; batch naming patterns; light theme and localization; direct file-descriptor streaming instead of copy-to-cache; Android TV companion layout.

## Scope constraints and open decisions

| ID | Constraint or decision | Impact if unresolved | Owner/needed by |
|---|---|---|---|
| O-1 | Which device or emulator (and API level) is used for verification. **Measured 2026-10-27:** one AVD, `Pixel_5` (x86_64, target `android-37.0`, 2 GB RAM); no physical device attached; no API 26 image installed | Blocks Phase 1 acceptance; large-file and background claims stay unverified | Owner, before Phase 1 |
| O-2 | `ffmpeg-kit-extended@1.0.0` New Architecture compatibility | Blocks the whole project; stop condition in Phase 1 | Owner, Phase 1 |
| O-3 | Whether a small custom Kotlin SAF reader/writer module is required (the picker returns URIs, not streams) | Blocks saving the result and large-file handling | Owner, Phase 1 |
| O-4 | GPL-3.0 audit of the shipped native libraries | Blocks public distribution, not local builds | Owner, before Phase 7 release |
| O-5 | Maestro versus Detox for end-to-end tests on Windows | Blocks the automated E2E gate in Phase 7 | Owner, Phase 7 |
| O-6 | Audio handling default: re-encode AAC 128 kbps (compatibility) versus copy when already AAC (speed) | Affects output predictability; recommend always re-encoding for MVP | Owner, Phase 1 |

**Cut line.** Under schedule or risk pressure, defer in this order: subtitles (already P2), batch queue, audio extraction. Never defer: temporary-file cleanup, error reporting, the no-network and no-broad-storage-permission constraints, or background survival for long jobs — without those the product breaks its core promise.

## Optional sections

**Release success measures (planned evaluation, not user-validated)**

- Five successful on-device conversions spanning under 100 MB, roughly 500 MB, and above 1 GB, each verified with `ffprobe` and played in an unrelated player.
- Three cancellation runs (during copy-in, during conversion, during save) leaving no files in the app cache and no partial destination file where the platform allows deletion.
- One forced low-storage run that refuses to start and explains why.
- Manual accessibility pass: TalkBack reads every control with a meaningful label and progress is announced without flooding the user.

**Migration or rollout requirements**

None. There is no existing product, stored data, or installed base, so no migration is needed.

## Approval

Approver: `shazzark` (repository owner). Approved scope/version: none yet — this is `v0.1-mvp`, Draft. Conditions: O-1 through O-3 must be answered before Phase 1 can start, because each changes what Phase 1 must prove. A planned MVP is not user-validated until representative users actually try it.


# MVP scope

> **Purpose:** Define the smallest release that is genuinely useful and can be evaluated. **Related:** `project-brief.md` gives the why; `prd.md` defines selected behavior; `trd.md` states testable technical requirements; `implementation-plan.md` sequences the work.
>
> **Document rules:** `[Confirmed]`, `[Inferred]`, `[Recommended]`, `[Open question]` as defined in `project-brief.md`. This scope was authorized for implementation on 2026-10-29; the phase summary in `implementation-plan.md` distinguishes implementation from verified acceptance.

**Status:** Authorized for implementation; acceptance incomplete | **Owner:** `shazzark` (repository owner) | **Release/cut:** `v0.1-mvp`

## MVP outcome

One user, one phone, no network: select a video from device storage, convert it to a playable MP4, watch honest progress, and save the result to a folder they choose — including files above 1 GB, and without the job dying when the app is backgrounded.

## Must-have capabilities

| Priority | Capability | User value | Acceptance signal | Dependencies/status |
|---|---|---|---|---|
| P0 | Pick a source file through the system document UI (video or audio) | Conversion without broad storage permission; the user keeps control | The chosen file's name and size appear, with duration or an explicit "unknown" | `expo-document-picker` 58.0.4 [Confirmed available]; the picker copies the file into the app cache, which is the FFmpeg input; MIME filtering [Recommended] |
| P0 | Convert to MP4 (H.264 video, AAC audio) | The compatibility fix most users actually need | Output plays in a third-party player; desktop `ffprobe` reports `h264` + `aac` | `munim-ffmpeg` 0.9.2 [Confirmed available; integration **Unverified**] |
| P0 | Live progress, elapsed time, and cancel | Long jobs become tolerable and reversible | Progress rises monotonically from real FFmpeg statistics and reaches 100% before success; cancel ends the job and removes its temporary output | Phase 1 |
| P0 | Save to a user-chosen destination | Files land where the user looks for them | Output visible in the system Files app at the chosen folder | **Not Phase 1** (O-3): the Phase 1 result stays in the app cache and the path is shown. Phase 2 adds the write path, starting with `expo-file-system`'s StorageAccessFramework API before any custom native module |
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
| O-1 | Which device (and API level) is used for verification. **Answered 2026-10-27:** a physical Android phone over USB debugging — built and installed with `npx expo run:android --device <adb serial>`; the emulator is closed and out of the workflow. **Measured on the phone 2026-10-27:** API level 34 (Android 14), model SM-A135F, primary ABI `armeabi-v7a` | Blocks Phase 1 acceptance; large-file and background claims stay unverified | Owner — answered and recorded; the API 26 floor and API 33 notification behaviour cannot be run on this single device and are code-reviewed instead |
| O-2 | `munim-ffmpeg@0.9.2` compatibility with the target under the New Architecture (Expo development build). **Answered 2026-10-27:** proceed with 0.9.2. If `npx expo prebuild` or `npx expo run:android` fails because of the engine, the exact error is recorded and the work stops — no silent fallback, and the fallback in `trd.md` is used only with the owner's explicit approval | Blocks the whole project; stop condition in Phase 1 | Owner — answered |
| O-3 | Whether a small custom Kotlin SAF reader/writer module is required (the picker returns URIs, not streams). **Answered 2026-10-27:** dropped for Phase 1. `expo-document-picker` copies the selection into the app cache and that cached path is the FFmpeg input; a custom Kotlin streaming module may return **only** if a >1 GB test proves the cache copy insufficient, and that is a later phase, not Phase 1 | Saving to a user-chosen folder moves to Phase 2; large-file handling keeps a known copy cost | Owner — answered |
| O-4 | Licence audit of the shipped native libraries before public distribution. **Answered 2026-10-27 for the project licence:** the application code is MIT (`LICENSE`); the LGPLv3 FFmpeg is conveyed through `THIRD_PARTY_NOTICES.md` (full licence text, build configuration, relink statement) with the GPLv3 text at `LICENSES/GPL-3.0.txt`. The line-by-line audit of the remaining bundled libraries is still owed | Blocks public distribution, not local builds | Owner — project licence answered; library audit due before the Phase 7 release |
| O-5 | Maestro versus Detox for end-to-end tests on Windows | Blocks the automated E2E gate in Phase 7 | Owner, Phase 7 |
| O-6 | Audio handling default. **Answered 2026-10-27: MP3** for audio-only output. Video presets always re-encode their audio track to AAC rather than copying it, so the output is predictable | Affects output predictability | Owner — answered |

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

Approval: `shazzark` (repository owner) authorized the described work on 2026-10-29. Historical O-1/O-2/O-3/O-6 answers remain above. The MVP is not user-validated, and phase acceptance remains open where implementation, automated, or device evidence is incomplete.


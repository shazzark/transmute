# Transmute

> On-device Android media converter â€” convert video, extract audio, and embed subtitles.

## Status

**Phase 4 implementation is in progress; device acceptance remains blocked.** The app has an in-memory FIFO queue, a native Android foreground service, Router paths for conversion, queue, results, and result details, session-only result history, and startup cleanup for interrupted conversions. Notification setup no longer blocks queue startup. The background notification tap opens `/results` through an Android deep link, and successful batches post a separate completion notification.

Automatically verified in this checkout: TypeScript, 388 Vitest tests across 26 files, Expo SDK 58 config, and Android prebuild. The generated debug manifest was inspected before the latest permission-blocking change; current debug and release manifests still need build-time inspection. `adb devices` cannot start in this shell (`adb_utils.cpp:316 Cannot mkdir '\\.android': Permission denied`), so installation, real conversions after these changes, notification behavior, device playback support, and device deep-link tests are not verified. Phase 4 and later phases remain incomplete until their documented device gates are met.

History policy: queue rows and result history live in memory for one app process. Outputs stay in the app cache while the process is active; restarting clears the visible history and startup recovery removes cache output left by a marked interrupted batch. There is no backend or durable conversion history.

## Features implemented (device verification remains open)

- Convert video: MP4, MKV, MOV, WEBM (the selector enables a preset only when the build reports its required encoder and a probed input has the needed stream)
- Extract audio: MP3, M4A/AAC, WAV, FLAC, OGG/Vorbis, OPUS
- Embed SRT sidecars into supported video containers; extract text tracks to SRT or VTT
- Batch conversion queue â€” implemented; Phase 4 device checks open
- Large-file behavior over 1 GB is not verified in this checkout
- Background conversion with foreground service notification â€” implemented; device survival and cancellation checks open

## Output format matrix (implementation, not a device certification)

The bundled engine's encoder inventory controls which formats the selector enables. A missing encoder is shown as the reason for unavailability; Transmute never substitutes a codec or container. Real-output verification is complete only for the historical MP4 conversion recorded in `tasks.md`; the other rows still need device `ffprobe` and playback evidence.

| Group | Output | Requested streams/codecs | Automatic capability check | Real device evidence |
|---|---|---|---|---|
| Video | MP4 | H.264 + AAC | H.264 encoder candidate and AAC encoder | Prior MP4 conversion and `ffprobe` recorded in T-13; current UI path not rerun |
| Video | MKV | H.264 + AAC | H.264 encoder candidate and AAC encoder | Not run |
| Video | MOV | H.264 + AAC | H.264 encoder candidate and AAC encoder | Not run |
| Video | WEBM | VP9 + Opus | `libvpx-vp9` or `libvpx`, plus `libopus` | Not run |
| Audio | MP3 | MP3 | `libmp3lame` | Not run |
| Audio | M4A | AAC | `aac` | Not run |
| Audio | WAV | PCM signed 16-bit | `pcm_s16le` | Not run |
| Audio | FLAC | FLAC | `flac` | Not run |
| Audio | OGG | Vorbis | `libvorbis` | Not run |
| Audio | OPUS | Opus | `libopus` | Not run |

The selected input must also contain the stream needed by the requested output. Encoder presence alone does not prove a combination is playable on a device.

## Batch queue

Select several files in one trip through the system picker; they are converted strictly one at a time, in the order picked, because two FFmpeg encodes on one phone is slower than two encodes one after the other.

- Every row states its own condition: queued, converting with a real percentage, converted, failed with the reason and a Try again button, or cancelled.
- **Remove** on a waiting row removes it and deletes its picker cache copy. **Cancel** on the running row asks first, then stops the engine and deletes the partial file. **Cancel all** stops the batch; already-converted files are kept.
- A file that fails does not stop the batch. Its reason stays attached to its row.
- The output format applies to the whole batch and cannot be changed while a row is running â€” a batch is never half in one container.
- A finished row appears in Results with Save to Phone and Share. Clearing finished rows removes their app-cache source and output directories. A single-file batch also attempts the existing automatic Photos copy; a batch of many does not.

## Background conversion

Conversions run in the app's own process, so Android needs a foreground service to keep a backgrounded app from being frozen or killed. The service is a local Expo module (`modules/transmute-background`), not a dependency: it shows one ongoing, silent notification with the batch position, the current file, and overall progress, plus a Cancel action that stops the batch the same way Cancel All does.

- Declared as `android:foregroundServiceType="dataSync"`, the truthful description of "work that finishes on its own schedule"; Android 14+ rejects a foreground service without a type.
- The notification channel is created before the startup permission request. If permission is refused, the conversion still runs and the screen says the notification is unavailable.
- Apps targeting Android 15+ can run `dataSync` foreground services for up to six hours in a 24-hour period while backgrounded. Transmute stops the service and cancels the active batch if Android calls its timeout callback; this native path still needs device verification.

## Subtitle support

Subtitles are handled as text tracks only â€” nothing is burned into the picture.

- **Embed:** one sidecar at a time. Only `.srt` is accepted in this phase; the file is validated (timing lines, cue count, span) before the engine is asked to read it, so a malformed file is refused with a reason instead of producing a broken output.
- **Extract:** any embedded text track can be copied out to `.srt` or `.vtt`. The engine writes it into the job directory in the app cache, and the panel then offers to save it into a folder the user picks â€” Downloads or Documents, so it shows up in a file manager. A sidecar is a text document, not media, so the photo library is never offered; Android is handed `application/x-subrip` (or `text/vtt`) when the file is created, falling back to `text/plain` in a folder that refuses it.

| Output format | Subtitle codec | What players do with it |
|---|---|---|
| MP4 | `mov_text` | VLC, mpv, and most desktop players show the track; some TV and gallery apps ignore it |
| MOV | `mov_text` | QuickTime Player and VLC show the track |
| MKV | `srt` | SubRip is kept unchanged, so most players offer track selection |
| WEBM | `webvtt` | the text is converted; players that open WebM usually show the track |
| MP3, M4A, WAV, FLAC, OGG, OPUS | â€” | audio-only: no subtitle stream exists, so a chosen sidecar is refused before the job starts |

Not yet: ASS or VTT sidecars as input, subtitle styling, and burn-in.

## Tech Stack

- **Framework:** Expo SDK 58 on React Native 0.88.0 (New Architecture), run as an **Expo development build** â€” Expo Go cannot load native modules
- **Media Engine:** [`munim-ffmpeg`](https://www.npmjs.com/package/munim-ffmpeg) `0.9.2` (FFmpeg 9.0.2, LGPLv3 build, Nitro Module)
- **Native Project:** continuous native generation â€” `npx expo prebuild` generates `android/`, which is not committed
- **Language:** TypeScript
- **File Access:** `expo-document-picker` (the system document UI; the chosen file is copied into the app cache, which is what FFmpeg reads) plus `expo-file-system` for the job directory in that cache
- **Testing:** Vitest (unit), Detox or Maestro (E2E on Android)

## Requirements

- Android API 26+ (Android 8.0)
- Expo SDK 58 (React Native 0.88.0)
- Node.js 20+
- A physical Android device with USB debugging enabled â€” verification runs on a phone, not an emulator, because an emulator has no hardware encoder (conversions are slow and HEVC is unavailable)

## Getting Started

```bash
git clone https://github.com/shazzark/transmute.git
cd transmute
npm install                  # also downloads ~106 MB of prebuilt FFmpeg libraries
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"   # PowerShell: $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"                  # PowerShell: $env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
npm run prebuild             # generates android/ from app.json + the engine's config plugin
npm run android -- --device <adb serial>
```

`npm install` downloads the prebuilt FFmpeg libraries and the first `npm run android` downloads Gradle dependencies plus the development client, so the first build needs a network connection and time. `--device` targets a connected phone; the serial comes from `adb devices`.

Checks that do not need a device:

```bash
npm test                     # vitest run: domain, application, tokens
npm run typecheck            # tsc --noEmit
```

> **Expo Go:** munim-ffmpeg contains native code and cannot run in Expo Go. A development build is required.

## Licensing

**MIT (application code) + LGPLv3 third-party FFmpeg (see `THIRD_PARTY_NOTICES.md`).**

The application code is MIT (determined 2026-10-27, `LICENSE`). It bundles native libraries under their own licences â€” principally FFmpeg 9.0.2, which is an **LGPLv3** build made without `--enable-gpl`, so no x264/x265 and no GPL code is distributed. The LGPL duties still apply, and are met by three files:

- `THIRD_PARTY_NOTICES.md` â€” what ships and under which licence, the full LGPLv3 text, and the relink statement.
- `scripts/ffmpeg-build.md` â€” the exact `configure` invocation that produced the bundled FFmpeg and the route to rebuild or relink a modified one.
- `LICENSES/GPL-3.0.txt` â€” the GPLv3 text that the LGPLv3 incorporates by reference.

A line-by-line audit of every bundled library is still owed before public distribution (O-4 in `mvp-scope.md`, TR-27 in `trd.md`).

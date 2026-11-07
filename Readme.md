# Transmute

> On-device Android media converter â€” convert video, extract audio, and embed subtitles.

## Status

**Phases 1–8 remain open pending their full acceptance evidence.** Transmute has local SQLite history and durable app-owned results. Current device evidence and remaining checks are recorded in `implementation-plan.md` and `tasks.md`.

Historical A13 verification on 2026-11-07 used an earlier APK: Home safe areas, tabs, MP3 shortcut, Android Back, picker open/cancel, one 3-second MP3 conversion, ffprobe, SAF save with matching SHA-256, share sheet, and MIT/LGPL notices were checked. The three older cache outputs were preserved during that earlier debug update.

Current automated checks pass: npm test reports 417 tests across 33 files, and npm run typecheck succeeds. The optimized ARMv7 release APK built successfully at 59,979,181 bytes. It contains the bundled Android JavaScript asset and libmunimffmpeg for armeabi-v7a. Its manifest has no INTERNET or broad storage permission, and its signing certificate matches the previously installed APK. The release update was installed with adb install -r; the three older outputs were present before installation, and no uninstall or data wipe was performed.

The corrected release cold-started on the unlocked A13 with SQLite available. A derived 176×144 synthetic fixture produced Ready Results for MP4, MKV, MOV, WEBM, MP3, M4A, WAV, FLAC, and OPUS. Each was opened and played or previewed in Transmute; Android media-session state reported `PLAYING` with no error. OPUS remained Ready and playable after force-stop and relaunch. The original 160×144 fixture failed MP4 conversion with the device encoder's 176×144 minimum-resolution message; it was preserved. OGG remains explicitly unavailable because this build lacks `libvorbis`. Subtitle operations and remaining phase device checks are still open; see `implementation-plan.md` and `tasks.md`.
History and output files are kept on this device only. Conversion history uses a versioned SQLite database; completed media and extracted subtitles are copied to Transmute's app-owned Documents storage before they are marked complete. Startup checks interrupted records and missing output files. Results provide separate confirmed actions to delete one output, remove one result and its owned file, or clear all history and owned output files. Transmute does not upload results or require a network connection for conversion or history.

## Features implemented (device verification remains open)

- Convert video: MP4, MKV, MOV, WEBM (the selector enables a preset only when the build reports its required encoder and a probed input has the needed stream)
- Extract audio: MP3, M4A/AAC, WAV, FLAC, and OPUS when the bundled encoder is present. OGG/Vorbis is unavailable in the current build because the FFmpeg build recipe omits `--enable-libvorbis`; the selector reports its missing encoder.
- Embed SRT or VTT sidecars into supported video containers; preserve ASS styling in MKV only; extract text tracks to durable SRT or VTT results
- Batch conversion queue â€” implemented; Phase 4 device checks open
- Large-file behavior over 1 GB is not verified in this checkout
- Background conversion with foreground service notification â€” implemented; device survival and cancellation checks open

## Output format matrix (implementation, not a device certification)

The bundled engine's encoder inventory controls which formats the selector enables. A missing encoder is shown as the reason for unavailability; Transmute never substitutes a codec or container. Device evidence below confirms retained outputs and in-app playback/preview for enabled formats; a separate `ffprobe` inspection of private app-owned output bytes is not recorded.

| Group | Output | Requested streams/codecs | Automatic capability check | Real device evidence |
|---|---|---|---|---|
| Video | MP4 | H.264 + AAC | H.264 encoder candidate and AAC encoder | Ready, 294 kB; in-app test-pattern playback confirmed |
| Video | MKV | H.264 + AAC | H.264 encoder candidate and AAC encoder | Ready, 294 kB; in-app playback confirmed |
| Video | MOV | H.264 + AAC | H.264 encoder candidate and AAC encoder | Ready, 294 kB; in-app playback confirmed |
| Video | WEBM | VP9 + Opus | `libvpx-vp9` or `libvpx`, plus `libopus` | Ready, 238 kB; in-app playback confirmed |
| Audio | MP3 | MP3 | `libmp3lame` | Ready, 68.5 kB; in-app playback confirmed |
| Audio | M4A | AAC | `aac` | Ready, 44.2 kB; in-app playback confirmed |
| Audio | WAV | PCM signed 16-bit | `pcm_s16le` | Ready, 246 kB; in-app playback confirmed |
| Audio | FLAC | FLAC | `flac` | Ready, 163 kB; in-app playback confirmed |
| Audio | OGG | Vorbis | `libvorbis` (unavailable: the bundled FFmpeg recipe does not enable libvorbis) | Unsupported in this build; no OGG sample will be created |
| Audio | OPUS | Opus | `libopus` | Ready, 52.2 kB; in-app playback confirmed after force-stop/relaunch |

The selected input must also contain the stream needed by the requested output. Encoder presence alone does not prove a combination is playable on a device.

## Batch queue

Select several files in one trip through the system picker; they are converted strictly one at a time, in the order picked, because two FFmpeg encodes on one phone is slower than two encodes one after the other.

- Every row states its own condition: queued, converting with a real percentage, converted, failed with the reason and a Try again button, or cancelled.
- **Remove** on a waiting row removes it and deletes its picker cache copy. **Cancel** on the running row asks first, then stops the engine and deletes the partial file. **Cancel all** stops the batch; already-converted files are kept.
- A file that fails does not stop the batch. Its reason stays attached to its row.
- The output format applies to the whole batch and cannot be changed while a row is running â€” a batch is never half in one container.
- Completed media appears in persistent Results with in-app playback, Save, and Share. Extracted subtitles appear as text results with Save and Share. Clearing queue activity does not delete persistent results; use the clearly named result/file controls in Results.

## Background conversion

Conversions run in the app's own process, so Android needs a foreground service to keep a backgrounded app from being frozen or killed. The service is a local Expo module (`modules/transmute-background`), not a dependency: it shows one ongoing, silent notification with the batch position, the current file, and overall progress, plus a Cancel action that stops the batch the same way Cancel All does.

- Declared as `android:foregroundServiceType="dataSync"`, the truthful description of "work that finishes on its own schedule"; Android 14+ rejects a foreground service without a type.
- The notification channel is created before the startup permission request. If permission is refused, the conversion still runs and the screen says the notification is unavailable.
- Apps targeting Android 15+ can run `dataSync` foreground services for up to six hours in a 24-hour period while backgrounded. Transmute stops the service and cancels the active batch if Android calls its timeout callback; this native path still needs device verification.

## Subtitle support

Subtitles are handled as text tracks only â€” nothing is burned into the picture.

- **Embed:** one SRT, WebVTT, or ASS sidecar at a time. Sidecars are validated before the engine reads them. ASS is offered only with MKV because MP4, MOV, and WebM cannot preserve ASS styling. Device verification for every container/sidecar pair remains open.
- **Extract:** supported embedded text tracks can be copied to SRT or VTT. The extracted file is kept in app-owned storage and appears in persistent Results, where its first 100 lines can be previewed; it can also be shared or saved to a folder. A subtitle is text, so it is not offered to Photos.

The table records the requested codec mapping; player behavior is descriptive, not tested on this device. Subtitle track listings and playback remain unverified for every container.

| Output format | Subtitle codec | What players do with it |
|---|---|---|
| MP4 | `mov_text` | VLC, mpv, and most desktop players show the track; some TV and gallery apps ignore it |
| MOV | `mov_text` | QuickTime Player and VLC show the track |
| MKV | `srt` | SubRip is kept unchanged, so most players offer track selection |
| WEBM | `webvtt` | the text is converted; players that open WebM usually show the track |
| MP3, M4A, WAV, FLAC, OGG, OPUS | â€” | audio-only: no subtitle stream exists, so a chosen sidecar is refused before the job starts |

Not yet: subtitle burn-in. ASS styling is preserved only for MKV; unsupported conversions are refused rather than silently flattened.

## Tech Stack

- **Framework:** Expo SDK 58 on React Native 0.88.0 (New Architecture), run as an **Expo development build** â€” Expo Go cannot load native modules
- **Media Engine:** [`munim-ffmpeg`](https://www.npmjs.com/package/munim-ffmpeg) `0.9.2` (FFmpeg 9.0.2, LGPLv3 build, Nitro Module)
- **Native Project:** continuous native generation â€” `npx expo prebuild` generates `android/`, which is not committed
- **Language:** TypeScript
- **File Access and Results:** `expo-document-picker` copies inputs to app cache for FFmpeg; `expo-sqlite` stores local history and `expo-file-system` keeps completed results under app-owned Documents storage.
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

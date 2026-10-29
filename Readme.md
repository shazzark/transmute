# Transmute

> On-device Android media converter — convert video, extract audio, and embed subtitles.

## Status

🚧 **Phase 6 in progress.** The app picks a video, probes it with the bundled engine, converts it on the device to one of its output formats, saves the finished file to Photos or a folder the user chooses, and now handles subtitles: a SubRip sidecar can be embedded into the output, and an embedded subtitle track can be extracted to SRT or VTT.

## Features (target)

- Convert video: MP4, MKV, M4V, MOV, WEBM, AVI, GIF, 3GP, FLV, MPG
- Extract audio: MP3, AAC, WAV, FLAC, ALAC, OGG, OPUS
- Export subtitles: SRT, ASS, VTT
- Embed subtitle files into video
- Batch conversion queue
- Large file support (>1GB)
- Background conversion with foreground service notification

## Subtitle support

Subtitles are handled as text tracks only — nothing is burned into the picture.

- **Embed:** one sidecar at a time. Only `.srt` is accepted in this phase; the file is validated (timing lines, cue count, span) before the engine is asked to read it, so a malformed file is refused with a reason instead of producing a broken output.
- **Extract:** any embedded text track can be copied out to `.srt` or `.vtt`. The written file stays in the app cache next to the conversion output.

| Output format | Subtitle codec | What players do with it |
|---|---|---|
| MP4 | `mov_text` | VLC, mpv, and most desktop players show the track; some TV and gallery apps ignore it |
| MOV | `mov_text` | QuickTime Player and VLC show the track |
| MKV | `srt` | SubRip is kept unchanged, so most players offer track selection |
| WEBM | `webvtt` | the text is converted; players that open WebM usually show the track |
| MP3, M4A, WAV, FLAC, OGG, OPUS | — | audio-only: no subtitle stream exists, so a chosen sidecar is refused before the job starts |

Not yet: ASS or VTT sidecars as input, subtitle styling, and burn-in.

## Tech Stack

- **Framework:** Expo SDK 58 on React Native 0.88.0 (New Architecture), run as an **Expo development build** — Expo Go cannot load native modules
- **Media Engine:** [`munim-ffmpeg`](https://www.npmjs.com/package/munim-ffmpeg) `0.9.2` (FFmpeg 9.0.2, LGPLv3 build, Nitro Module)
- **Native Project:** continuous native generation — `npx expo prebuild` generates `android/`, which is not committed
- **Language:** TypeScript
- **File Access:** `expo-document-picker` (the system document UI; the chosen file is copied into the app cache, which is what FFmpeg reads) plus `expo-file-system` for the job directory in that cache
- **Testing:** Vitest (unit), Detox or Maestro (E2E on Android)

## Requirements

- Android API 26+ (Android 8.0)
- Expo SDK 58 (React Native 0.88.0)
- Node.js 20+
- A physical Android device with USB debugging enabled — verification runs on a phone, not an emulator, because an emulator has no hardware encoder (conversions are slow and HEVC is unavailable)

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

The application code is MIT (determined 2026-10-27, `LICENSE`). It bundles native libraries under their own licences — principally FFmpeg 9.0.2, which is an **LGPLv3** build made without `--enable-gpl`, so no x264/x265 and no GPL code is distributed. The LGPL duties still apply, and are met by three files:

- `THIRD_PARTY_NOTICES.md` — what ships and under which licence, the full LGPLv3 text, and the relink statement.
- `scripts/ffmpeg-build.md` — the exact `configure` invocation that produced the bundled FFmpeg and the route to rebuild or relink a modified one.
- `LICENSES/GPL-3.0.txt` — the GPLv3 text that the LGPLv3 incorporates by reference.

A line-by-line audit of every bundled library is still owed before public distribution (O-4 in `mvp-scope.md`, TR-27 in `trd.md`).

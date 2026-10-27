# Transmute

> On-device Android media converter — convert video, extract audio, and embed subtitles.

## Status

🚧 **Phase 1 in progress.** The app now picks a video, probes it with the bundled engine, converts it to MP4 (H.264 + AAC) on the device, and shows progress from FFmpeg's own statistics. The result stays in the app cache until Phase 2 adds saving to a folder the user chooses.

## Features (target)

- Convert video: MP4, MKV, M4V, MOV, WEBM, AVI, GIF, 3GP, FLV, MPG
- Extract audio: MP3, AAC, WAV, FLAC, ALAC, OGG, OPUS
- Export subtitles: SRT, ASS, VTT
- Embed subtitle files into video
- Batch conversion queue
- Large file support (>1GB)
- Background conversion with foreground service notification

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

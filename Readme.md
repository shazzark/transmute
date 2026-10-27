# Transmute

> On-device Android media converter — convert video, extract audio, and embed subtitles.

## Status

🚧 **Active development.** Core conversion engine and UI in progress.

## Features (target)

- Convert video: MP4, MKV, M4V, MOV, WEBM, AVI, GIF, 3GP, FLV, MPG
- Extract audio: MP3, AAC, WAV, FLAC, ALAC, OGG, OPUS
- Export subtitles: SRT, ASS, VTT
- Embed subtitle files into video
- Batch conversion queue
- Large file support (>1GB)
- Background conversion with foreground service notification

## Tech Stack

- **Framework:** Expo SDK on React Native 0.81.6+ (New Architecture enabled), run as an **Expo development build** — Expo Go cannot load native modules
- **Media Engine:** [`munim-ffmpeg`](https://www.npmjs.com/package/munim-ffmpeg) (FFmpeg 9.0.2, LGPLv3 build, Nitro Module)
- **Native Project:** continuous native generation — `npx expo prebuild` generates `android/`, which is not committed
- **Language:** TypeScript
- **File Access:** `expo-document-picker` (the system document UI; the chosen file is copied into the app cache, which is what FFmpeg reads)
- **Testing:** Vitest (unit), Detox or Maestro (E2E on Android)

## Requirements

- Android API 26+ (Android 8.0)
- Expo SDK on React Native 0.81.6+
- Node.js 20+
- A physical Android device with USB debugging enabled — verification runs on a phone, not an emulator, because an emulator has no hardware encoder (conversions are slow and HEVC is unavailable)

## Getting Started

The project scaffold lands in Phase 1 (see `tasks.md`); these are the commands it will use.

```bash
git clone https://github.com/shazzark/transmute.git
cd transmute
npm install
npx expo prebuild
npx expo run:android --device
```

`npm install` downloads the prebuilt FFmpeg libraries (well over 100 MB) and the first `npx expo run:android --device` downloads Gradle dependencies plus the development client, so the first build needs a network connection and time. `--device` targets a connected phone; pass its adb serial (`--device <adb serial>` as listed by `adb devices`) to be unambiguous.

> **Expo Go:** munim-ffmpeg contains native code and cannot run in Expo Go. A development build is required.

## Licensing

**MIT (application code) + LGPLv3 third-party FFmpeg (see `THIRD_PARTY_NOTICES.md`).**

The application code is MIT (determined 2026-10-27, `LICENSE`). It bundles native libraries under their own licences — principally FFmpeg 9.0.2, which is an **LGPLv3** build made without `--enable-gpl`, so no x264/x265 and no GPL code is distributed. The LGPL duties still apply, and are met by three files:

- `THIRD_PARTY_NOTICES.md` — what ships and under which licence, the full LGPLv3 text, and the relink statement.
- `scripts/ffmpeg-build.md` — the exact `configure` invocation that produced the bundled FFmpeg and the route to rebuild or relink a modified one.
- `LICENSES/GPL-3.0.txt` — the GPLv3 text that the LGPLv3 incorporates by reference.

A line-by-line audit of every bundled library is still owed before public distribution (O-4 in `mvp-scope.md`, TR-27 in `trd.md`).

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

- **Framework:** React Native 0.81.6+ (New Architecture enabled)
- **Media Engine:** [`ffmpeg-kit-extended`](https://www.npmjs.com/package/ffmpeg-kit-extended) (FFmpeg 9.0.1, Turbo Native Module)
- **Language:** TypeScript
- **File Access:** Storage Access Framework via `@react-native-documents/picker`
- **Testing:** Vitest (unit), Detox or Maestro (E2E on Android)

## Requirements

- Android API 26+ (Android 8.0)
- React Native 0.81.6+
- Node.js 20+

## Getting Started

```bash
git clone https://github.com/shazzark/transmute.git
cd transmute
npm install
cd android && ./gradlew clean && cd ..
npm run android
```

## Licensing

This project is licensed under **GPL-3.0** because it bundles GPL-licensed FFmpeg codecs (x264/x265). See `LICENSE`.

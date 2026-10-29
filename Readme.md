# Transmute

> On-device Android media converter — convert video, extract audio, and embed subtitles.

## Status

🚧 **Phase 3 in progress.** The app picks one or more videos, probes them with the bundled engine, converts them on the device one after another, and saves the finished files. Phase 3 added the batch queue and the foreground service that keeps a conversion running while the app is in the background.

What is verified: `npx tsc --noEmit` and `npx vitest run` (366 tests) pass, `npx expo prebuild` succeeds, the local module compiles (`:transmute-background:compileDebugKotlin`), and the merged debug manifest declares `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`, and the service with `android:foregroundServiceType="dataSync"`.

What is not verified yet: the device checks from Phase 3 — a batch backgrounded with the screen off, the notification's Cancel, the force-stop recovery, and the notification permission prompt. **No phone was attached for this phase** (`adb devices` listed nothing), so those are open, not passed.

## Features (target)

- Convert video: MP4, MKV, M4V, MOV, WEBM, AVI, GIF, 3GP, FLV, MPG
- Extract audio: MP3, AAC, WAV, FLAC, ALAC, OGG, OPUS
- Export subtitles: SRT, ASS, VTT
- Embed subtitle files into video
- Batch conversion queue — **done, Phase 3**
- Large file support (>1GB)
- Background conversion with foreground service notification — **done, Phase 3**

## Batch queue

Select several files in one trip through the system picker; they are converted strictly one at a time, in the order picked, because two FFmpeg encodes on one phone is slower than two encodes one after the other.

- Every row states its own condition: queued, converting with a real percentage, converted, failed with the reason and a Try again button, or cancelled.
- **Cancel** on a waiting row removes it before it costs anything. **Cancel** on the running row asks first, then stops the engine and deletes the partial file. **Cancel all** stops the batch; already-converted files are kept.
- A file that fails does not stop the batch. Its reason stays attached to its row.
- The output format applies to the whole batch and cannot be changed while a row is running — a batch is never half in one container.
- A finished row offers its own copy (Photos or a chosen folder). A single-file batch still copies to Photos automatically, as before; a batch of many does not, so twenty files cannot fill the photo library unasked.

## Background conversion

Conversions run in the app's own process, so Android needs a foreground service to keep a backgrounded app from being frozen or killed. The service is a local Expo module (`modules/transmute-background`), not a dependency: it shows one ongoing, silent notification with the batch position, the current file, and overall progress, plus a Cancel action that stops the batch the same way Cancel All does.

- Declared as `android:foregroundServiceType="dataSync"`, the truthful description of "work that finishes on its own schedule"; Android 14+ rejects a foreground service without a type.
- The notification permission is requested once, when Convert is tapped. If it is refused the conversion still runs and the screen says the notification is unavailable — a denied notification must never become a failed conversion.
- Android 15+ caps `dataSync` services per day; that limit and its behaviour are documented in `implementation-plan.md` as unverified until a device run records it.

## Subtitle support

Subtitles are handled as text tracks only — nothing is burned into the picture.

- **Embed:** one sidecar at a time. Only `.srt` is accepted in this phase; the file is validated (timing lines, cue count, span) before the engine is asked to read it, so a malformed file is refused with a reason instead of producing a broken output.
- **Extract:** any embedded text track can be copied out to `.srt` or `.vtt`. The engine writes it into the job directory in the app cache, and the panel then offers to save it into a folder the user picks — Downloads or Documents, so it shows up in a file manager. A sidecar is a text document, not media, so the photo library is never offered; Android is handed `application/x-subrip` (or `text/vtt`) when the file is created, falling back to `text/plain` in a folder that refuses it.

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

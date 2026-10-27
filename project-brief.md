# Project brief

> **Purpose:** State why Transmute exists, who it serves, and the result it should create. **Related:** `mvp-scope.md` narrows the first release; `prd.md` details behavior; `implementation-plan.md` sequences delivery.
>
> **Document rules:** Every claim carries a label — `[Confirmed]` (observed in this repository or measured in this environment), `[Inferred]` (reasoned from confirmed facts, not verified), `[Recommended]` (a proposal awaiting the owner's approval), `[Open question]` (unresolved, possibly blocking). **Nothing in this document is implemented:** the repository contains a README and no application code. Keep status `Draft` until the owner approves it.

**Status:** Draft | **Owner:** `shazzark` (repository owner, per the README clone URL — [Confirmed]) | **Last updated:** 2026-10-27

## Problem and context

Android users routinely end up with media that other devices, apps, or chat clients refuse: a phone recording in HEVC that a car head unit will not play, an MKV download a TV rejects, a lecture video whose audio the user wants as MP3, or a video that needs a subtitle track embedded or extracted.

Today they choose between three workarounds, each with a real cost:

- **Desktop tools (HandBrake, FFmpeg, VLC):** capable, but require moving a multi-gigabyte file to a computer and back.
- **Cloud/online converters:** require uploading personal media to an unknown service; slow on mobile data, metered, and often capped below the file sizes that matter most (1 GB and above).
- **Existing Android converter apps:** often ad-supported, watermarked, or unclear about whether files leave the device; their privacy claims cannot be checked from outside ([Assumption] — no store research has been performed).

Transmute's premise [Recommended]: conversion is CPU work a modern phone can do locally, so the upload round-trip, the data cost, and the privacy exposure can all be removed. FFmpeg is the reference implementation for the formats involved, and `munim-ffmpeg` exposes it to Expo and React Native ([Confirmed] the package exists on npm at version 0.9.2, published 2026-10-17, bundling FFmpeg 9.0.2 as an LGPLv3 build and requiring `react-native-nitro-modules >=0.36.5 <1`; [Unverified] behaviour on the target device).

## Target users

- **Primary [Assumption]:** an Android phone or tablet user holding personal media (camera recordings, downloads, received files) who needs a different container, codec, or an audio-only copy. They are comfortable choosing a file and a save folder, but they are not video editors.
- **Secondary [Assumption]:** privacy-conscious users who will not upload personal media to a web converter, and users on metered or slow connections where a 2 GB upload is impractical.
- **Explicitly not targeted [Recommended]:** professional editors (no timeline, preview scopes, or multi-track work), DRM-protected playback, streaming, and cross-device sync.

No interviews, store reviews, or analytics exist yet. These personas are inferences from the feature list in `Readme.md`, not validated research.

## Intended outcome

A user takes a video that is already on the phone, converts it to a compatible format, and ends up with a playable file in a folder they chose — offline, with honest progress, and without any file leaving the device.

The product is useful when the output plays in a third-party player and the user never had to think about codecs, temporary files, or permissions.

## Constraints and unknowns

**Fixed constraints**

- Android only, API 26+ (Android 8.0) [Confirmed, `Readme.md`].
- An Expo app (development build) on React Native 0.81.6+ with the New Architecture enabled, in TypeScript [Confirmed, `Readme.md`; Expo pivot approved 2026-10-27].
- Media engine `munim-ffmpeg` (Nitro module), loaded only in a development build because Expo Go cannot run native modules [Confirmed from the package README, 2026-10-27]. Unpatched compatibility with the target device is [Unverified] and is Phase 1's feasibility question.
- File access: `expo-document-picker` for selection (the selected file is copied into the app cache, which is the path FFmpeg reads), with `@react-native-documents/picker` as the recorded alternative; registry metadata confirms `expo-document-picker` 58.0.4, MIT, peer `expo` `*` [Confirmed, measured 2026-10-27]. Saving the result to a user-chosen folder is **not** in Phase 1: the Phase 1 output stays in the app cache (O-3).
- Licence position, settled 2026-10-27: the application code is **MIT** (`LICENSE`), while the bundled FFmpeg 9.0.2 remains **LGPLv3** and was built without `--enable-gpl`, so no x264/x265 code ships and no GPL obligation is inherited [Confirmed from the upstream build script `scripts/ffmpeg/build-android.sh`, 2026-10-27]. The LGPL duties survive — notices, licence text, build configuration, and a relink offer — and are answered by `THIRD_PARTY_NOTICES.md` and `scripts/ffmpeg-build.md`; the line-by-line audit of every bundled library remains O-4 with a Phase 7 deadline (TR-27).
- No backend, accounts, or cloud storage [Recommended]: it keeps the privacy promise enforceable and the operational surface at zero.
- Development host is Windows. Measured toolchain: Node.js v22.13.0, npm 11.1.0; `ANDROID_HOME` and `ANDROID_SDK_ROOT` are currently empty in the shell although an SDK exists at `C:\Users\chido\AppData\Local\Android\Sdk` and Android Studio is installed [Confirmed, measured 2026-10-27]. No `java` executable is on `PATH` and `JAVA_HOME` is empty; the JDK that Android Studio ships is present at `C:\Program Files\Android\Android Studio\jbr\bin\java.exe` and reports `openjdk version "21.0.9"` [Confirmed, measured 2026-10-27]. Installed Android platforms: `android-36.1`; installed system image: `android-37.0` (`google_apis`, `x86_64`); one AVD exists, `Pixel_5` (`x86_64`, target `android-37.0`, 2 GB RAM); `adb devices` now lists the owner's phone as `device`, authorised 2026-10-27, and that phone is the O-1 verification target [Confirmed, measured 2026-10-27]. Its API level is read in T-01 (`ro.build.version.sdk`) and recorded in the phase report. No API 26 image is installed, so with a single target device the API 26 floor is code-reviewed rather than run, and that gap is named in the phase report instead of being claimed as tested.

**Unknowns that affect scope**

- Target device and its API level [Answered 2026-10-27]. A physical Android phone over USB debugging is the verification target, built and installed with `npx expo run:android --device <adb serial>`; the emulator is closed and out of scope, because an emulator has no hardware encoder and its storage and timing make the >1 GB and background-survival claims meaningless. The phone's API level is read in T-01 and recorded in the phase report; until then the API 26 floor and the API 33/34 behaviours rest on code review rather than a run [Open question: API level].
- Whether `munim-ffmpeg@0.9.2` builds and runs unpatched under the New Architecture on the target, and whether that target has the hardware encoders the presets assume [Open question]. Satisfying the peer range is consistent but is not evidence.
- Whether Maestro runs on this Windows host [Open question]; Detox is the documented fallback and is not yet chosen.
- Which advertised input containers the shipped build can actually decode, and at what speed [Open question — only measurable by running conversions].

## Success signals

Observable evidence, with no invented thresholds (no performance target is set until it is measured on the target device):

1. A 500 MB–1.2 GB MP4/H.264 input converts on-device, the result plays in a third-party player, and the phone is offline throughout.
2. UI progress tracks the real conversion, reaches completion before the success state, and the interface stays responsive while converting.
3. After success, cancel, and failure, the app's cache returns to its pre-job size (no orphaned temporary media).
4. The installed app declares no internet permission and no broad storage permission.
5. Someone who has never seen the app can go from launch to a converted file without instructions ([Recommended] one-person informal usability check; this would be the first real user evidence).

## Optional sections

**Alternatives considered**

- *Cloud converter:* rejected for MVP because upload cost, size caps, and privacy exposure are the exact problems being solved.
- *Desktop FFmpeg:* rejected as the product, retained as a verification tool (desktop `ffprobe` on generated outputs).
- *Wrapping an existing media library:* rejected because it adds unknown licensing and quality constraints; a direct FFmpeg binding keeps behavior predictable.

**Stakeholders and decision owners**

- Product and technical decisions: repository owner (`shazzark`), a single decision maker [Assumption].
- Users: nobody has been consulted; no validation is recorded.

## Approval

Status `Draft` v0.1, 2026-10-27. No approval recorded. Approval of this brief authorizes planning only — it does not authorize scaffolding, dependency installation, or implementation; `implementation-plan.md` governs that handoff.


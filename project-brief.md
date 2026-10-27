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

Transmute's premise [Recommended]: conversion is CPU work a modern phone can do locally, so the upload round-trip, the data cost, and the privacy exposure can all be removed. FFmpeg is the reference implementation for the formats involved, and `ffmpeg-kit-extended` exposes it to React Native ([Confirmed] the package exists on npm at version 1.0.0, last published 2026-10-19, declaring `react-native >= 0.81.6`; [Unverified] the bundled FFmpeg 9.0.1 version claimed in `Readme.md`).

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
- React Native 0.81.6+ with the New Architecture enabled, in TypeScript [Confirmed, `Readme.md`].
- Media engine `ffmpeg-kit-extended` consumed as a Turbo Native Module [Confirmed, `Readme.md`]. New Architecture compatibility is [Unverified] and is Phase 1's feasibility question.
- File access through the Storage Access Framework using `@react-native-documents/picker` [Confirmed, `Readme.md`]; registry metadata confirms 12.0.3, MIT, `react-native >= 0.79.0` [Confirmed, measured 2026-10-27].
- GPL-3.0 distribution because the bundled x264/x265 codecs are GPL [Confirmed as a README claim]. The npm metadata for `ffmpeg-kit-extended@1.0.0` declares `LGPL-2.1-or-later`, which does not describe bundled codec licenses, so the real obligation needs an audit before any public release (TR-27).
- No backend, accounts, or cloud storage [Recommended]: it keeps the privacy promise enforceable and the operational surface at zero.
- Development host is Windows. Measured toolchain: Node.js v22.13.0, npm 11.1.0; `ANDROID_HOME` and `ANDROID_SDK_ROOT` are currently empty in the shell although an SDK exists at `C:\Users\chido\AppData\Local\Android\Sdk` and Android Studio is installed [Confirmed, measured 2026-10-27]. No `java` executable is on `PATH` and `JAVA_HOME` is empty; the JDK that Android Studio ships is present at `C:\Program Files\Android\Android Studio\jbr\bin\java.exe` [Confirmed, measured 2026-10-27]. Installed Android platforms: `android-36.1`; installed system image: `android-37.0` (`google_apis`, `x86_64`); one AVD exists, `Pixel_5` (`x86_64`, target `android-37.0`, 2 GB RAM); `adb devices` lists nothing attached [Confirmed, measured 2026-10-27]. No API 26 image is installed, so the minimum-SDK end of the compatibility range cannot be exercised without downloading one.

**Unknowns that affect scope**

- Target device versus emulator, and the available API level [Open question]. Without a real device, the >1 GB and background-survival claims cannot be tested. As of 2026-10-27 an emulator (`Pixel_5`, API 37, x86_64, 2 GB RAM) is the only available target; whether an emulator's storage and performance make the large-file and 16 KB-page checks meaningful is still unresolved [Open question].
- Whether `ffmpeg-kit-extended@1.0.0` builds and runs under RN 0.81.6 New Architecture unpatched [Open question]. Its declared peer range is consistent but is not evidence.
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


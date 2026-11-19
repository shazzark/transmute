# Third-party notices

Transmute's own source code is licensed under the MIT License (see `LICENSE`). The app also
contains native code built from third-party projects, which keep their own licences. This file
records what ships, under which terms, and how to obtain and relink the components.

**Status (2026-11-19):** all identified native license texts, including giflib 5.2.1 `COPYING`, are bundled under `LICENSES/` and displayed offline from Settings. The GIFLIB file matches the extracted file from Debian's 444187-byte versioned source archive (SHA-256 `31da5562f44c5f15d63340a09a4fd62b48c45620cd302f77a6d9acf0077879bd`); the COPYING SHA-256 is `0c9b7990ecdca88b676db232c226548ac408b279f550d424d996f0d83591dd8e`. The ARMv7 native library matches the `munim-ffmpeg@0.9.2` archive SHA-256 pinned
in its package manifest. That archive's build-info lists exact dependency versions, and the
upstream `v0.9.2` build script at commit `82c828fcd51bbda0f5752da78a714ee9c7e0cde6` pins the
same versions. The build-info header says `0.8.0`, so it is stale. The version-pinned source
archives and their original component license/copyright files are checked in under `LICENSES/upstream/`
and in the local source bundle described in `LICENSES/README.md`.

## Other native code in the Android package

The APK also contains Android framework and React Native runtime libraries. Their presence is
independent of the FFmpeg engine and is included in the release inventory. Cached Gradle POMs
confirm the listed artifact versions and license identifiers; Fresco's v3.7.0 source pins the
statically compiled image codecs. Version-matched full texts for libjpeg-turbo, libpng, giflib,
libwebp, Fresco, LLVM, Nitro, React Native, Expo, gesture/navigation, and Apache-licensed runtimes
are in `LICENSES/runtime/` and the offline app notice map. The app map is generated from those
checked-in texts and the lockfile-installed package licenses.

| Bundled native components | Version / source | License and copyright evidence |
|---|---|---|
| `libimagepipeline.so`, `libgifimage.so`, `libnative-filters.so`, `libnative-imagetranscoder.so`, `libstatic-webp.so` | Fresco 3.7.0 | MIT, Meta Platforms, Inc. and affiliates; cached Maven POM and versioned upstream license. Fresco statically compiles libjpeg-turbo 2.1.5.1, libpng 1.6.37, giflib 5.2.1 and libwebp 1.3.2; full binary notices required. |
| `libreactnative.so`, `libjsi.so`, `libhermesvm.so`, `libhermestooling.so` | React Native 0.88.0 / Hermes artifact 260318099.0.4 | MIT; package metadata. |
| `libexpo-modules-core.so`, `libexpo-modules-jsi.so`, `libexpo-modules-v2.so`, `libexpo-modules-worklets.so`, `libexpo-sqlite.so`, `libappmodules.so` | Expo 58.0.19 and app modules | MIT; package metadata and local package license files. |
| `libgesturehandler.so`, `librnscreens.so`, generated screen/gesture codegen libraries, `libreanimated.so`, `libworklets.so`, `libNitroModules.so`, `libNitroMunimFfmpeg.so`, `libnative-filters.so` | React Native community packages | MIT; package metadata and local package license files. |
| `libfbjni.so` | fbjni 0.7.0 | Apache-2.0; cached POM. |
| `libdatastore_shared_counter.so` | AndroidX DataStore 1.1.7 | Apache-2.0; cached POM. |
| `libzstd-kmp.so` | Square zstd-kmp 0.4.0 | Apache-2.0; cached POM. |
| `libc++_shared.so` | Android NDK 27.1.12297006 | LLVM Project license with LLVM exception; NDK-bundled C++ runtime. |

The offline notice set is complete for the inspected APK inventory. Its full texts are displayed
in the Settings notices route; version and provenance evidence is recorded in `LICENSES/README.md`
and `LICENSES/runtime/README.md`.

## What ships in the Android app

| Component | Version | Licence | Notes |
|---|---|---|---|
| FFmpeg | 9.0.2 | **LGPLv3** | Built with `--enable-version3` and **without** `--enable-gpl`, so no x264/x265 and no GPL-only components. Full text below. |
| `libmunimffmpeg.so` (per ABI) | from `munim-ffmpeg` 0.9.2 | Apache-2.0 (wrapper code) | Statically links the FFmpeg libraries plus the dependencies listed below into one shared object. |
| LAME (`libmp3lame`) | 3.100 | GNU Library GPL version 2 | MP3 encoder. |
| libopus | 1.6.1 | BSD-3-Clause | Opus encoder/decoder. |
| libvpx | 1.17.0 | BSD-3-Clause | VP8/VP9. |
| dav1d | 1.5.4 | BSD-2-Clause plus AOMedia patent terms | AV1 decoder. |
| libaom | 3.15.1 | BSD-2-Clause plus the AOM patent licence | `--disable-decoder=libaom_av1` is set, so it is linked but its AV1 decoder is not built. |
| openh264 | 2.6.0 | BSD-2-Clause | Software H.264 encoder fallback. Software H.264 may raise AVC patent licensing questions, which O-4 tracks. |
| libass | 0.17.5 | ISC | Subtitle rendering. |
| FreeType | 2.14.3 | FreeType Licence (FTL), with a GPLv2 alternative | Used under the FTL. |
| HarfBuzz | 14.5.1 | MIT | Text shaping. |
| FriBidi | 1.0.17 | LGPL-2.x | Bidirectional text. |
| fontconfig | 2.18.3 | MIT-style fontconfig licence | Font matching. |
| expat | 2.8.5 | MIT | XML parser used by fontconfig. |
| mbedTLS | 3.6.7 | Apache-2.0 (or GPL-2.0) | TLS. Used under Apache-2.0. |
| zlib | Android system | zlib licence | Compression. |

The applicable full license texts and the AOMedia patent license are included in `LICENSES/` and
in the offline Settings notice screen. The app's MIT license is in `LICENSE`; the untouched
canonical GPL-3.0 text used for the LGPL reference is `LICENSES/GPL-3.0-canonical.txt`.

## Beta review disposition (2026-11-19)

- APK inspection verified `libmunimffmpeg.so` and its ARMv7 native dependencies in the beta
  package. The package metadata identifies FFmpeg 9.0.2 and the documented `munim-ffmpeg` 0.9.2
  build. The upstream package states LGPLv3, `--enable-version3`, and no `--enable-gpl` flag;
  this configuration excludes GPL-only x264/x265 components.
- The configured static dependencies and their upstream-declared licence families are listed
  above and in `scripts/ffmpeg-build.md`. LGPL-covered components include FFmpeg, LAME, and
  FriBidi. The list also identifies BSD, ISC, FTL, MIT-style, zlib, Apache-2.0, and AOM patent
  license materials now bundled and surfaced offline in Settings. The source filenames and
  provenance are recorded in `LICENSES/README.md`.
- The binary archive SHA-256 matches the exact upstream package manifest. Its source tag and build
  script pin every native dependency to the versions in the table. The original per-component
  license and copyright files are included under `LICENSES/upstream/`, and the full matching source
  archives plus relinking scripts are in the generated native source bundle. The release asset is
  still required to deliver those sources with the APK.

## FFmpeg build configuration and how to reproduce it

The bundled FFmpeg is a stock 9.0.2 release built by the upstream `munim-ffmpeg` scripts. The
configuration used for this project, the exact `configure` invocation, the dependency versions,
and the steps to rebuild a modified FFmpeg are documented in this repository at
[`scripts/ffmpeg-build.md`](scripts/ffmpeg-build.md). The build scripts themselves are published
by the engine at <https://github.com/munimtechnologies/munim-ffmpeg> under `scripts/ffmpeg/`
(`fetch-source.sh`, `build-android.sh`, `build-all.sh`, `package.sh`), and FFmpeg's source is
<https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz>.

## Your right to relink a modified FFmpeg

FFmpeg is statically linked into `libmunimffmpeg.so`, which the LGPL permits only if you can
replace the library with a modified version. You can:

1. Rebuild FFmpeg from source with your changes, following `scripts/ffmpeg-build.md`.
2. Relink it into `libmunimffmpeg.so` using the published build scripts.
3. Install the relinked library into the app's native library directory for the ABI you use and
   rebuild or repackage the app, as described in the same document.

Nothing in the MIT licence for Transmute's own code, and nothing in the app's packaging, prevents
you from doing this. The build scripts are the complete build description; there is no unpublished
step.

## No warranty

These components are provided as-is, without warranty of any kind, as stated in their own
licences. Transmute does not offer support for modified builds.

---

## GNU Lesser General Public License v3.0 (full text)

The following is the complete text of the GNU Lesser General Public License, version 3, as
shipped with FFmpeg in `COPYING.LGPLv3`. It is reproduced verbatim.

                   GNU LESSER GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.


  This version of the GNU Lesser General Public License incorporates
the terms and conditions of version 3 of the GNU General Public
License, supplemented by the additional permissions listed below.

  0. Additional Definitions.

  As used herein, "this License" refers to version 3 of the GNU Lesser
General Public License, and the "GNU GPL" refers to version 3 of the GNU
General Public License.

  "The Library" refers to a covered work governed by this License,
other than an Application or a Combined Work as defined below.

  An "Application" is any work that makes use of an interface provided
by the Library, but which is not otherwise based on the Library.
Defining a subclass of a class defined by the Library is deemed a mode
of using an interface provided by the Library.

  A "Combined Work" is a work produced by combining or linking an
Application with the Library.  The particular version of the Library
with which the Combined Work was made is also called the "Linked
Version".

  The "Minimal Corresponding Source" for a Combined Work means the
Corresponding Source for the Combined Work, excluding any source code
for portions of the Combined Work that, considered in isolation, are
based on the Application, and not on the Linked Version.

  The "Corresponding Application Code" for a Combined Work means the
object code and/or source code for the Application, including any data
and utility programs needed for reproducing the Combined Work from the
Application, but excluding the System Libraries of the Combined Work.

  1. Exception to Section 3 of the GNU GPL.

  You may convey a covered work under sections 3 and 4 of this License
without being bound by section 3 of the GNU GPL.

  2. Conveying Modified Versions.

  If you modify a copy of the Library, and, in your modifications, a
facility refers to a function or data to be supplied by an Application
that uses the facility (other than as an argument passed when the
facility is invoked), then you may convey a copy of the modified
version:

   a) under this License, provided that you make a good faith effort to
   ensure that, in the event an Application does not supply the
   function or data, the facility still operates, and performs
   whatever part of its purpose remains meaningful, or

   b) under the GNU GPL, with none of the additional permissions of
   this License applicable to that copy.

  3. Object Code Incorporating Material from Library Header Files.

  The object code form of an Application may incorporate material from
a header file that is part of the Library.  You may convey such object
code under terms of your choice, provided that, if the incorporated
material is not limited to numerical parameters, data structure
layouts and accessors, or small macros, inline functions and templates
(ten or fewer lines in length), you do both of the following:

   a) Give prominent notice with each copy of the object code that the
   Library is used in it and that the Library and its use are
   covered by this License.

   b) Accompany the object code with a copy of the GNU GPL and this license
   document.

  4. Combined Works.

  You may convey a Combined Work under terms of your choice that,
taken together, effectively do not restrict modification of the
portions of the Library contained in the Combined Work and reverse
engineering for debugging such modifications, if you also do each of
the following:

   a) Give prominent notice with each copy of the Combined Work that
   the Library is used in it and that the Library and its use are
   covered by this License.

   b) Accompany the Combined Work with a copy of the GNU GPL and this license
   document.

   c) For a Combined Work that displays copyright notices during
   execution, include the copyright notice for the Library among
   these notices, as well as a reference directing the user to the
   copies of the GNU GPL and this license document.

   d) Do one of the following:

       0) Convey the Minimal Corresponding Source under the terms of this
       License, and the Corresponding Application Code in a form
       suitable for, and under terms that permit, the user to
       recombine or relink the Application with a modified version of
       the Linked Version to produce a modified Combined Work, in the
       manner specified by section 6 of the GNU GPL for conveying
       Corresponding Source.

       1) Use a suitable shared library mechanism for linking with the
       Library.  A suitable mechanism is one that (a) uses at run time
       a copy of the Library already present on the user's computer
       system, and (b) will operate properly with a modified version
       of the Library that is interface-compatible with the Linked
       Version.

   e) Provide Installation Information, but only if you would otherwise
   be required to provide such information under section 6 of the
   GNU GPL, and only to the extent that such information is
   necessary to install and execute a modified version of the
   Combined Work produced by recombining or relinking the
   Application with a modified version of the Linked Version. (If
   you use option 4d0, the Installation Information must accompany
   the Minimal Corresponding Source and Corresponding Application
   Code. If you use option 4d1, you must provide the Installation
   Information in the manner specified by section 6 of the GNU GPL
   for conveying Corresponding Source.)

  5. Combined Libraries.

  You may place library facilities that are a work based on the
Library side by side in a single library together with other library
facilities that are not Applications and are not covered by this
License, and convey such a combined library under terms of your
choice, if you do both of the following:

   a) Accompany the combined library with a copy of the same work based
   on the Library, uncombined with any other library facilities,
   conveyed under the terms of this License.

   b) Give prominent notice with the combined library that part of it
   is a work based on the Library, and explaining where to find the
   accompanying uncombined form of the same work.

  6. Revised Versions of the GNU Lesser General Public License.

  The Free Software Foundation may publish revised and/or new versions
of the GNU Lesser General Public License from time to time. Such new
versions will be similar in spirit to the present version, but may
differ in detail to address new problems or concerns.

  Each version is given a distinguishing version number. If the
Library as you received it specifies that a certain numbered version
of the GNU Lesser General Public License "or any later version"
applies to it, you have the option of following the terms and
conditions either of that published version or of any later version
published by the Free Software Foundation. If the Library as you
received it does not specify a version number of the GNU Lesser
General Public License, you may choose any version of the GNU Lesser
General Public License ever published by the Free Software Foundation.

  If the Library as you received it specifies that a proxy can decide
whether future versions of the GNU Lesser General Public License shall
apply, that proxy's public statement of acceptance of any version is
permanent authorization for you to choose that version for the
Library.

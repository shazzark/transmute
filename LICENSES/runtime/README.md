# Additional Android runtime license materials

The APK contains Fresco 3.7.0 native image code. Fresco's versioned `gradle.properties` pins the
statically compiled codecs listed below. These version-matched license files are copied here
verbatim and displayed by the offline Settings notices screen:

| Destination | Exact upstream file | Version |
|---|---|---|
| `libjpeg-turbo-2.1.5.1-LICENSE.md` | <https://raw.githubusercontent.com/libjpeg-turbo/libjpeg-turbo/2.1.5.1/LICENSE.md> | 2.1.5.1 |
| `libjpeg-turbo-2.1.5.1-README.ijg` | <https://raw.githubusercontent.com/libjpeg-turbo/libjpeg-turbo/2.1.5.1/README.ijg> | 2.1.5.1 |
| `libpng-1.6.37-LICENSE` | <https://raw.githubusercontent.com/pnggroup/libpng/v1.6.37/LICENSE> | 1.6.37 |
| `giflib-5.2.1-COPYING` | extracted from Debian's unmodified upstream source archive, <https://deb.debian.org/debian/pool/main/g/giflib/giflib_5.2.1.orig.tar.gz> | 5.2.1 |
| `libwebp-1.3.2-COPYING` | <https://raw.githubusercontent.com/webmproject/libwebp/v1.3.2/COPYING> | 1.3.2 |
| `fresco-3.7.0-LICENSE` | <https://raw.githubusercontent.com/facebook/fresco/v3.7.0/LICENSE> | 3.7.0 |
| `react-native-nitro-modules-0.37.1-LICENSE` | <https://raw.githubusercontent.com/mrousavy/nitro/v0.37.1/LICENSE> | 0.37.1 |
| `llvm-NDK-27.1.12297006-LICENSE.txt` | <https://llvm.org/LICENSE.txt> | Android NDK 27.1.12297006 |

The fetch script also copies the exact `LICENSE` files from the lockfile-installed React Native,
Expo, Expo Modules Core, Gesture Handler, Screens, Reanimated, Worklets, and Safe Area Context
packages into this directory. It records those texts and the Apache-2.0 notices for fbjni,
AndroidX DataStore, and zstd-kmp in the generated offline license map.

Fresco's top-level `LICENSE` is MIT (Meta Platforms, Inc. and affiliates) and is already bundled in
the app's MIT notice text. The NDK LLVM license file includes the Apache 2.0 terms, LLVM exception,
and legacy LLVM attribution. AndroidX DataStore 1.1.7 and Square zstd-kmp 0.4.0, plus fbjni 0.7.0,
are Apache-2.0; that complete license is already present in `../Apache-2.0.txt`. The native runtime
inventory and cached POM evidence are in `../../THIRD_PARTY_NOTICES.md`.

The giflib archive was fetched and verified at 444187 bytes with SHA-256
`31da5562f44c5f15d63340a09a4fd62b48c45620cd302f77a6d9acf0077879bd`. Its extracted `COPYING`
(SHA-256 `0c9b7990ecdca88b676db232c226548ac408b279f550d424d996f0d83591dd8e`) matches
`giflib-5.2.1-COPYING` in this directory byte for byte. The offline map contains the same text.

Run `scripts/fetch-runtime-license-files.ps1` from the repository root in a network-enabled
PowerShell session to reproduce the generated map. The old SourceForge `/projects/.../download` URL returned HTTP 200 with
`text/html` and a roughly 105 KB dynamic download page, which explains the two differing hashes.
The script now downloads Debian's `giflib_5.2.1.orig.tar.gz` directly, prints response status,
final URL, content type, size and digest, rejects HTML and non-gzip data, and verifies the exact
444187-byte size and SHA-256 published by both the [SourceForge release listing](https://sourceforge.net/projects/giflib/files/giflib-5.x/)
and the [Debian source-package record](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=1131368;msg=32):
`31da5562f44c5f15d63340a09a4fd62b48c45620cd302f77a6d9acf0077879bd`, checks the expected archive
size/signature and extracted path, then generates
`src/content/nativeRuntimeLicenseTexts.ts` from the downloaded verbatim files and installed package
licenses.

# Bundled native license texts and source provenance

The Android app bundles these component license texts for offline use from Settings. Component
versions and source locations match `munim-ffmpeg` source tag `v0.9.2` at commit
`82c828fcd51bbda0f5752da78a714ee9c7e0cde6`.

The package's installed `scripts/binaries.json` pins the native archive SHA-256 to
`8628d2382e73768bbd760a6db7dd555c475daef3183790df19bb78da640dcaf4`. The public v0.9.2 release
archive matches that checksum exactly. Its `build-info.txt` identifies the following native source
versions and build configuration, but its header says `munim-ffmpeg 0.8.0`; that header is stale.
The v0.9.2 Android build script pins the same versions, so the binary-to-source mapping is
corroborated by both the archive checksum and the tagged build script.

| Component | Version | License text in this directory | Version-matched source |
| --- | --- | --- | --- |
| Transmute | beta source revision | `../LICENSE` (MIT) | This repository |
| munim-ffmpeg wrapper | 0.9.2 | `Apache-2.0.txt` plus `node_modules/munim-ffmpeg/LICENSE` | https://github.com/munimtechnologies/munim-ffmpeg/tree/v0.9.2 |
| FFmpeg | 9.0.2 | `upstream/ffmpeg-9.0.2/COPYING.LGPLv3`, incorporated `COPYING.GPLv3` | https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz |
| LAME | 3.100 | `upstream/lame-3.100/COPYING` (GNU Library GPL version 2) | https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz |
| Opus | 1.6.1 | `upstream/opus-1.6.1/COPYING` | https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz |
| libvpx | 1.17.0 | `upstream/libvpx-1.17.0/LICENSE` and `PATENTS` | https://github.com/webmproject/libvpx/archive/refs/tags/v1.17.0.tar.gz |
| dav1d | 1.5.4 | `upstream/dav1d-1.5.4/COPYING` and `doc/PATENTS` | https://downloads.videolan.org/pub/videolan/dav1d/1.5.4/dav1d-1.5.4.tar.xz |
| libaom | 3.15.1 | `upstream/libaom-3.15.1/LICENSE` and `PATENTS` | https://storage.googleapis.com/aom-releases/libaom-3.15.1.tar.gz |
| OpenH264 | 2.6.0 | `upstream/openh264-2.6.0/LICENSE` | https://github.com/cisco/openh264/archive/refs/tags/v2.6.0.tar.gz |
| FreeType | 2.14.3 | `upstream/freetype-2.14.3/LICENSE.TXT` | https://download.savannah.gnu.org/releases/freetype/freetype-2.14.3.tar.xz |
| FriBidi | 1.0.17 | `upstream/fribidi-1.0.17/COPYING` (LGPLv2.1-or-later) | https://github.com/fribidi/fribidi/releases/download/v1.0.17/fribidi-1.0.17.tar.xz |
| HarfBuzz | 14.5.1 | `upstream/harfbuzz-14.5.1/COPYING` (Old MIT) | https://github.com/harfbuzz/harfbuzz/releases/download/14.5.1/harfbuzz-14.5.1.tar.xz |
| Expat | 2.8.5 | `upstream/expat-2.8.5/COPYING` | https://github.com/libexpat/libexpat/releases/download/R_2_8_5/expat-2.8.5.tar.xz |
| fontconfig | 2.18.3 | `upstream/fontconfig-2.18.3/COPYING` | https://gitlab.freedesktop.org/api/v4/projects/890/packages/generic/fontconfig/2.18.3/fontconfig-2.18.3.tar.xz |
| libass | 0.17.5 | `upstream/libass-0.17.5/COPYING` | https://github.com/libass/libass/releases/download/0.17.5/libass-0.17.5.tar.xz |
| mbedTLS | 3.6.7 | `upstream/mbedtls-3.6.7/LICENSE`; Apache selected | https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-3.6.7/mbedtls-3.6.7.tar.bz2 |
| zlib | Android system library | `Zlib.txt` terms; Android supplies the runtime | Android NDK/system; no separate zlib shared object is packaged |

`AOMedia-PATENTS.txt` is from the official AOMedia source. FFmpeg is configured with
`--enable-version3` and without `--enable-gpl`; the full LGPLv3 terms and their incorporated GPLv3
terms are included. LAME carries its GNU Library GPL version 2 terms; FriBidi carries LGPLv2.1-or-later. The exact package
source versions and build command are recorded in `../THIRD_PARTY_NOTICES.md` and
`../scripts/ffmpeg-build.md`.

Additional Android runtime texts are listed in `runtime/README.md` and shown alongside the engine licenses. The giflib 5.2.1 `COPYING` file is included and matches the versioned Debian source archive extraction; archive and file SHA-256 values are documented in `runtime/README.md`.

## Source distribution and remaining verification

The exact upstream source URLs and build scripts are version-pinned above and in the upstream tag.
The source archives have been downloaded, their top-level copyright/license files are checked into
this repository under `upstream/`, and a local 130 MB source bundle is prepared by
`scripts/prepare-native-source-bundle.ps1`. It contains FFmpeg and LGPL dependency sources, all
other linked native dependency sources, the v0.9.2 wrapper/build scripts, license files,
checksums, and the relinking record. Source redistribution is complete once this bundle is attached
to the beta release beside the corresponding public application source revision.

The upstream v0.9.2 release's `build-info.txt` has a stale 0.8.0 version header. Its dependency
versions and configure command agree with the v0.9.2 build script and its binaries archive
checksum matches the package's pinned SHA-256; preserve this provenance note in any distribution.


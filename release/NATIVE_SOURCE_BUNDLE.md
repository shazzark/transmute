# Android native source distribution

`transmute-v0.2.0-beta.1-native-sources.tar.gz` is the version-pinned source archive for the
ARMv7 media engine distributed in the beta APK. It contains the complete upstream source
archives for the linked FFmpeg and codec/font/TLS dependencies, the `munim-ffmpeg` v0.9.2 source
tag (commit `82c828fcd51bbda0f5752da78a714ee9c7e0cde6`) with Android build/relink scripts, and
an archive manifest with source URLs and SHA-256 checksums.

The source tag's Android script pins the same versions reported by the checksum-verified native
archive. The upstream `build-info.txt` embedded in the release workflow has a stale `0.8.0`
header; the v0.9.2 release archive SHA-256 matches the `binaries.json` hash in the npm package.
The build-info file and this mismatch explanation are included in the archive.

The application source and its MIT license are in the accompanying public Transmute repository
revision used for the release. The source bundle does not include a signing key. On Android, build
and install a modified version as a separate package for testing; replacing a signed installation
may require uninstalling it, which removes that installation's private data. See
`THIRD_PARTY_NOTICES.md` and `scripts/ffmpeg-build.md` for the LGPL notice and relinking route.

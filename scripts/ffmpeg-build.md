# FFmpeg build configuration (LGPLv3 compliance record)

Transmute ships a stock **FFmpeg 9.0.2** build and does not patch FFmpeg's source. This document
records the configuration that built the libraries inside the app, so anyone can reproduce the
build or produce a modified FFmpeg and relink it. That record is what the LGPLv3 asks for; the
licence texts and the relink statement live in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Who builds it

The libraries come from the [`munim-ffmpeg`](https://github.com/munimtechnologies/munim-ffmpeg)
package (Apache-2.0, version 0.9.2). Its published tarball contains prebuilt `libmunimffmpeg.so`
files for three ABIs; the build scripts that generate them are published in the same repository
under `scripts/ffmpeg/`:

| Script | Job |
|---|---|
| `fetch-source.sh` | Downloads `ffmpeg-9.0.2.tar.xz` from `https://ffmpeg.org/releases/` into `~/.munim-ffmpeg-build`. |
| `build-android.sh <abi>` | Fetches and builds every dependency, then configures and builds FFmpeg for one ABI. |
| `build-android-fftools.sh <abi>` | Builds the CLI-style tool entry points (`ffmpeg`, `ffprobe`) as libraries rather than executables. |
| `build-all.sh` | Runs the Android ABIs (`arm64-v8a`, `armeabi-v7a`, `x86_64`), the iOS slices, then packaging. |
| `package.sh` | Copies the results into the package's `android/src/main/jniLibs/<abi>/`. |

`npm run binaries:build` (inside the package) runs `fetch-source.sh` then `build-all.sh`.

**Host requirement:** the scripts are bash and target a POSIX host with the Android NDK. On this
Windows development machine they need WSL or Git Bash; the search paths for the NDK differ from
the ones the script assumes, so `ANDROID_NDK` must be set explicitly.

## Toolchain and flags

- NDK `27.1.12297006` by default, overridable with `ANDROID_NDK` / `ANDROID_NDK_HOME`.
- `ANDROID_API` defaults to `24`; the project compiles against the API 26 floor of the app.
- `CFLAGS="-O2 -fPIC -DANDROID -ffunction-sections -fdata-sections"`, with `-mfpu=neon -mfloat-abi=softfp` added for `armeabi-v7a`.
- `LDFLAGS="-Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384"` — 16 KB page alignment, required by newer Android kernels.
- `armeabi-v7a` builds libvpx with its `generic-gnu` target because NDK 27's clang rejects `-march=armv7-a` for that triple.

## The exact `configure` invocation

Copied verbatim from `scripts/ffmpeg/build-android.sh` (upstream `main` as of 2026-10-27):

```bash
"$SOURCE/configure" \
  --prefix="$PREFIX" \
  --target-os=android \
  --arch="$FF_ARCH" \
  --cpu="$FF_CPU" \
  --enable-cross-compile \
  --sysroot="$TOOLCHAIN/sysroot" \
  --cc="$CC" --cxx="$CXX" --ar="$AR" --nm="$NM" --ranlib="$RANLIB" --strip="$STRIP" \
  --extra-cflags="$CFLAGS -I$PREFIX/include" \
  --extra-ldflags="$LDFLAGS -L$PREFIX/lib" \
  --extra-libs="-lc++_shared" \
  --pkg-config-flags=--static \
  --disable-autodetect \
  --enable-static --disable-shared --enable-pic \
  --enable-asm --enable-inline-asm \
  --enable-jni --enable-mediacodec \
  --enable-zlib --enable-libmp3lame --enable-libopus --enable-libvpx \
  --enable-libdav1d --enable-libaom --disable-decoder=libaom_av1 \
  --enable-libopenh264 --enable-mbedtls --enable-version3 \
  --enable-libass --enable-libfreetype --enable-libfribidi --enable-libharfbuzz \
  --enable-libfontconfig \
  --enable-pthreads --enable-swscale --enable-avfilter --enable-network \
  --enable-protocol=file,pipe,http,tcp,https,tls,crypto,data,concat,concatf \
  --disable-programs --disable-doc --disable-debug --disable-vulkan \
  --disable-v4l2-m2m --disable-indev=android_camera \
```

Dependency versions pinned in that script: LAME 3.100, libass 0.17.5, mbedTLS 3.6.7, plus
libopus, libvpx, dav1d, libaom, openh264, FreeType, HarfBuzz, FriBidi, fontconfig, expat and zlib
fetched from their own upstream releases. Fontconfig is built with Meson, with
`-Ddefault-fonts-dirs=/system/fonts`.

## What the flags mean for Transmute

| Flag | Consequence |
|---|---|
| `--enable-version3`, no `--enable-gpl` | The result is **LGPLv3**, not LGPLv2.1, and contains no GPL-only component: no x264, no x265. That is why the app itself can be MIT-licensed. |
| `--enable-mediacodec --enable-jni` | Hardware H.264/HEVC encoding through Android's MediaCodec (`h264_mediacodec`, `hevc_mediacodec`). |
| `--enable-libopenh264` | Software H.264 fallback. There is **no** software HEVC encoder, so HEVC is unsupported on a device whose SoC exposes no hardware encoder. |
| `--enable-network` with `http`, `https`, `tls`, `crypto` protocols | The engine *can* open network URLs. The app's offline promise is therefore enforced by the absent `INTERNET` permission and by an argument policy that accepts local paths only — not by the engine lacking the capability. `trd.md` constraint 5 records this. |
| `--disable-programs` | No `ffmpeg`/`ffprobe` executables are shipped; the tool entry points are built as libraries by `build-android-fftools.sh`. |
| `--enable-static --disable-shared` | Everything is linked into `libmunimffmpeg.so` per ABI. This is the static-linking case the LGPL permits only when a relink route exists, so the route below is part of the notice. |

## Rebuilding and relinking a modified FFmpeg

The route, in order. **Not yet executed in this project** — it is recorded as the documented
method and is validated the first time a modified build is actually needed:

1. Clone <https://github.com/munimtechnologies/munim-ffmpeg> at the tag matching the installed
   version, and set `FFMPEG_VERSION`, `ANDROID_NDK`, and `ANDROID_API`.
2. Patch FFmpeg's source as you wish (or leave `fetch-source.sh` pointing at your own tree), then
   run `scripts/ffmpeg/build-all.sh`. Outputs land in `$FFMPEG_WORKSPACE/out/android-<abi>`.
3. Run `scripts/ffmpeg/package.sh` to place the rebuilt `libmunimffmpeg.so` into the package's
   `android/src/main/jniLibs/<abi>/`.
4. Make that replacement survive `npm install`: either apply it as a patch (`patch-package`) or
   copy the rebuilt `.so` for your ABI into the app through a small config plugin, so
   `npx expo prebuild` preserves it.
5. `npx expo prebuild --clean --platform android`, then `npx expo run:android --device <adb serial>`.

Steps 4 and 5 use the same packaging route the app uses for its own native code. A rebuilt library
is not a supported configuration, and Transmute offers no support for it.


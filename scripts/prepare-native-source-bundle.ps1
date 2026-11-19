$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$recovery = Join-Path $root '.local-recovery'
$sourceDir = Join-Path $recovery 'native-sources'
$tagZip = Join-Path $recovery 'munim-ffmpeg-source-v0.9.2.zip'
$buildInfo = Join-Path $recovery 'munim-build-info.txt'
$nativeArchive = Join-Path $recovery 'munim-ffmpeg-binaries-0.9.2.tar.gz'
$bundleRoot = Join-Path $recovery 'native-source-bundle'
$bundleName = 'transmute-v0.2.0-beta.1-native-sources.tar.gz'
$bundlePath = Join-Path $recovery $bundleName

$expectedNativeArchiveHash = '8628d2382e73768bbd760a6db7dd555c475daef3183790df19bb78da640dcaf4'
$expectedSourceArchives = @(
  'dav1d-1.5.4.tar.xz', 'expat-2.8.5.tar.xz', 'ffmpeg-9.0.2.tar.xz',
  'fontconfig-2.18.3.tar.xz', 'freetype-2.14.3.tar.xz', 'fribidi-1.0.17.tar.xz',
  'harfbuzz-14.5.1.tar.xz', 'lame-3.100.tar.gz', 'libaom-3.15.1.tar.gz',
  'libass-0.17.5.tar.xz', 'libvpx-1.17.0.tar.gz', 'mbedtls-3.6.7.tar.bz2',
  'openh264-2.6.0.tar.gz', 'opus-1.6.1.tar.gz'
)
if (!(Test-Path $sourceDir -PathType Container)) { throw "Missing pinned source archives: $sourceDir" }
foreach ($sourceName in $expectedSourceArchives) {
  if (!(Test-Path (Join-Path $sourceDir $sourceName) -PathType Leaf)) {
    throw "Missing version-pinned source archive: $sourceName"
  }
}
if (!(Test-Path $tagZip -PathType Leaf)) { throw "Missing munim-ffmpeg v0.9.2 source tag: $tagZip" }
if (!(Test-Path $buildInfo -PathType Leaf)) { throw "Missing upstream build-info file: $buildInfo" }
$nativeHash = (Get-FileHash $nativeArchive -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
if ($nativeHash -ne $expectedNativeArchiveHash) { throw "Upstream native archive hash mismatch: $nativeHash" }
if (Test-Path $bundleRoot) { Remove-Item -LiteralPath $bundleRoot -Recurse -Force }
New-Item -ItemType Directory -Path $bundleRoot | Out-Null
Copy-Item $sourceDir (Join-Path $bundleRoot 'native-sources') -Recurse
Copy-Item $tagZip (Join-Path $bundleRoot 'munim-ffmpeg-v0.9.2-source.zip')
Copy-Item $buildInfo (Join-Path $bundleRoot 'upstream-build-info.txt')
$bundleLicenses = Join-Path $bundleRoot 'LICENSES'
New-Item -ItemType Directory -Path $bundleLicenses | Out-Null
Get-ChildItem (Join-Path $root 'LICENSES') -Force | Where-Object { $_.Name -ne 'GPL-3.0.txt' } | ForEach-Object {
  # The retained local GPL-3.0.txt edit is not canonical; bundle the untouched source copies instead.
  Copy-Item -LiteralPath $_.FullName -Destination $bundleLicenses -Recurse
}
Copy-Item (Join-Path $root 'THIRD_PARTY_NOTICES.md') $bundleRoot
Copy-Item (Join-Path $root 'scripts/ffmpeg-build.md') $bundleRoot
Copy-Item (Join-Path $root 'release/NATIVE_SOURCE_BUNDLE.md') (Join-Path $bundleRoot 'README.md')

$manifest = @(
  'Transmute beta native source bundle; source archive SHA256 values below.'
  "Verified upstream binary archive SHA256: $nativeHash"
  'Source URLs and pinned versions are documented in LICENSES/README.md and the v0.9.2 build scripts.'
  'NOTE: upstream-build-info.txt labels itself 0.8.0; the v0.9.2 build script and release asset hash provide the version mapping.'
)
Get-ChildItem (Join-Path $bundleRoot 'native-sources') -File | Sort-Object Name | ForEach-Object {
  $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest += "$hash  native-sources/$($_.Name)"
}
$manifest += "$( (Get-FileHash (Join-Path $bundleRoot 'munim-ffmpeg-v0.9.2-source.zip') -Algorithm SHA256).Hash.ToLowerInvariant() )  munim-ffmpeg-v0.9.2-source.zip"
Set-Content (Join-Path $bundleRoot 'SHA256SUMS.txt') -Value $manifest -Encoding utf8
if (Test-Path $bundlePath) { Remove-Item -LiteralPath $bundlePath -Force }
& tar.exe -czf $bundlePath -C $recovery 'native-source-bundle'
if ($LASTEXITCODE -ne 0) { throw "Could not create source bundle (tar exit $LASTEXITCODE)." }
Get-FileHash $bundlePath -Algorithm SHA256
Get-Item $bundlePath | Select-Object Name,Length


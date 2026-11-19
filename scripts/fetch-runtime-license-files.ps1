$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $repoRoot 'LICENSES\runtime'
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$files = @(
    @{ Url = 'https://raw.githubusercontent.com/libjpeg-turbo/libjpeg-turbo/2.1.5.1/LICENSE.md'; Name = 'libjpeg-turbo-2.1.5.1-LICENSE.md' },
    @{ Url = 'https://raw.githubusercontent.com/libjpeg-turbo/libjpeg-turbo/2.1.5.1/README.ijg'; Name = 'libjpeg-turbo-2.1.5.1-README.ijg' },
    @{ Url = 'https://raw.githubusercontent.com/pnggroup/libpng/v1.6.37/LICENSE'; Name = 'libpng-1.6.37-LICENSE' },
    @{ Url = 'https://raw.githubusercontent.com/webmproject/libwebp/v1.3.2/COPYING'; Name = 'libwebp-1.3.2-COPYING' },
    @{ Url = 'https://raw.githubusercontent.com/facebook/fresco/v3.7.0/LICENSE'; Name = 'fresco-3.7.0-LICENSE' },
    @{ Url = 'https://raw.githubusercontent.com/mrousavy/nitro/v0.37.1/LICENSE'; Name = 'react-native-nitro-modules-0.37.1-LICENSE' },
    @{ Url = 'https://llvm.org/LICENSE.txt'; Name = 'llvm-NDK-27.1.12297006-LICENSE.txt' }
)
foreach ($file in $files) {
    Invoke-WebRequest -Uri $file.Url -OutFile (Join-Path $destination $file.Name) -UseBasicParsing
}

$scratch = Join-Path $env:TEMP ("transmute-giflib-license-" + [guid]::NewGuid().ToString('N'))
$archive = "$scratch.tar.gz"
$extract = "$scratch-source"
# Debian's orig source archive is the unmodified upstream giflib 5.2.1 tarball. Use the
# distribution archive directly; SourceForge's /download endpoints return an HTML landing page.
$sourceUrl = 'https://deb.debian.org/debian/pool/main/g/giflib/giflib_5.2.1.orig.tar.gz'
$response = Invoke-WebRequest -Uri $sourceUrl -OutFile $archive -PassThru -MaximumRedirection 10 -UseBasicParsing
$expectedSha256 = '31da5562f44c5f15d63340a09a4fd62b48c45620cd302f77a6d9acf0077879bd'
$expectedSize = 444187
$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
$archiveBytes = [System.IO.File]::ReadAllBytes($archive)
$actualSize = (Get-Item -LiteralPath $archive).Length
$finalUri = if ($response.BaseResponse.ResponseUri) { $response.BaseResponse.ResponseUri.AbsoluteUri } else { $sourceUrl }
$contentType = $response.Headers['Content-Type']
Write-Host "giflib response: status=$($response.StatusCode); finalUrl=$finalUri; contentType=$contentType; bytes=$actualSize; sha256=$actualSha256"
if ($response.StatusCode -ne 200 -or $contentType -match 'text/html' -or $actualSize -ne $expectedSize -or $archiveBytes.Length -lt 2 -or $archiveBytes[0] -ne 0x1f -or $archiveBytes[1] -ne 0x8b) {
    $prefix = [System.Text.Encoding]::UTF8.GetString($archiveBytes, 0, [Math]::Min(160, $archiveBytes.Length)).Replace("`r", ' ').Replace("`n", ' ')
    throw "giflib response is not the expected gzip archive (expected HTTP 200 and $expectedSize bytes; prefix='$prefix'). Inspect the final URL/content type above."
}
if ($actualSha256 -ne $expectedSha256) { throw "giflib archive SHA-256 mismatch (SourceForge and Debian independently publish $expectedSha256 for this $expectedSize-byte archive): $actualSha256" }
New-Item -ItemType Directory -Path $extract | Out-Null
tar.exe -xzf $archive -C $extract
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the verified giflib source archive.' }
$copying = Get-Item -LiteralPath (Join-Path $extract 'giflib-5.2.1/COPYING') -ErrorAction SilentlyContinue
if (-not $copying) { throw 'The checksum-verified giflib-5.2.1 archive did not contain giflib-5.2.1/COPYING.' }
Copy-Item -LiteralPath $copying.FullName -Destination (Join-Path $destination 'giflib-5.2.1-COPYING')

# Preserve the exact MIT notices shipped in the installed, lockfile-selected JS packages.
$npmPackages = @('react-native', 'expo', 'expo-modules-core', 'react-native-gesture-handler', 'react-native-screens', 'react-native-reanimated', 'react-native-worklets', 'react-native-safe-area-context')
foreach ($package in $npmPackages) {
    $packageRoot = Join-Path $repoRoot (Join-Path 'node_modules' $package)
    $metadataPath = Join-Path $packageRoot 'package.json'
    $licensePath = Join-Path $packageRoot 'LICENSE'
    if (-not (Test-Path -LiteralPath $metadataPath) -or -not (Test-Path -LiteralPath $licensePath)) { throw "Missing installed license metadata or LICENSE for $package." }
    $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    if ($metadata.license -ne 'MIT') { throw "Unexpected license for $package@$($metadata.version): $($metadata.license)" }
    Copy-Item -LiteralPath $licensePath -Destination (Join-Path $destination "$package-$($metadata.version)-LICENSE")
}

# Embed the reviewed full texts in the app bundle so Settings can show them offline.
$licenseEntries = @(
    @{ Title = 'Fresco 3.7.0 (MIT; Meta Platforms, Inc. and affiliates)'; File = 'fresco-3.7.0-LICENSE' },
    @{ Title = 'React Native 0.88.0 (MIT; Meta Platforms, Inc. and affiliates)'; File = 'react-native-0.88.0-LICENSE' },
    @{ Title = 'Expo 58.0.19 (MIT; 650 Industries)'; File = 'expo-58.0.19-LICENSE' },
    @{ Title = 'Expo Modules Core 58.0.26 (MIT; 650 Industries)'; File = 'expo-modules-core-58.0.26-LICENSE' },
    @{ Title = 'React Native Gesture Handler 3.4.0 (MIT; Software Mansion)'; File = 'react-native-gesture-handler-3.4.0-LICENSE' },
    @{ Title = 'React Native Screens 4.30.1 (MIT; Software Mansion)'; File = 'react-native-screens-4.30.1-LICENSE' },
    @{ Title = 'React Native Reanimated 4.7.1 (MIT; Software Mansion)'; File = 'react-native-reanimated-4.7.1-LICENSE' },
    @{ Title = 'React Native Worklets 0.13.1 (MIT; copyright notice names nobody)'; File = 'react-native-worklets-0.13.1-LICENSE' },
    @{ Title = 'React Native Safe Area Context 5.10.1 (MIT; Th3rd Wave)'; File = 'react-native-safe-area-context-5.10.1-LICENSE' },
    @{ Title = 'React Native Nitro Modules 0.37.1 (MIT; Marc Rousavy)'; File = 'react-native-nitro-modules-0.37.1-LICENSE' },
    @{ Title = 'libjpeg-turbo 2.1.5.1 (IJG, modified BSD and zlib terms)'; File = 'libjpeg-turbo-2.1.5.1-LICENSE.md' },
    @{ Title = 'libjpeg-turbo 2.1.5.1 IJG notice and license'; File = 'libjpeg-turbo-2.1.5.1-README.ijg' },
    @{ Title = 'libpng 1.6.37 (PNG Reference Library License)'; File = 'libpng-1.6.37-LICENSE' },
    @{ Title = 'giflib 5.2.1 (MIT; Eric S. Raymond)'; File = 'giflib-5.2.1-COPYING' },
    @{ Title = 'libwebp 1.3.2 (BSD; Google Inc.)'; File = 'libwebp-1.3.2-COPYING' },
    @{ Title = 'Android NDK 27.1.12297006 C++ runtime (LLVM Apache-2.0 with LLVM exception)'; File = 'llvm-NDK-27.1.12297006-LICENSE.txt' }
)
$licenseMap = [ordered]@{}
foreach ($entry in $licenseEntries) {
    $path = Join-Path $destination $entry.File
    if (-not (Test-Path -LiteralPath $path)) { throw "Required runtime license is missing: $path" }
    $licenseMap[$entry.Title] = [System.IO.File]::ReadAllText($path)
}
$apacheText = [System.IO.File]::ReadAllText((Join-Path $repoRoot 'LICENSES\Apache-2.0.txt'))
$licenseMap['fbjni 0.7.0 (Apache-2.0; Meta Platforms, Inc. and affiliates)'] = "Copyright Meta Platforms, Inc. and affiliates.`r`n`r`n$apacheText"
$licenseMap['AndroidX DataStore 1.1.7 (Apache-2.0; The Android Open Source Project)'] = "Copyright The Android Open Source Project.`r`n`r`n$apacheText"
$licenseMap['Square zstd-kmp 0.4.0 (Apache-2.0; Square, Inc.)'] = "Copyright Square, Inc.`r`n`r`n$apacheText"
$contentModule = "// Generated from the version-pinned verbatim files under LICENSES/runtime.`r`nexport const nativeRuntimeLicenseTexts: Record<string, string> = " + ($licenseMap | ConvertTo-Json -Depth 4) + ";`r`n"
$contentModulePath = Join-Path $repoRoot 'src\content\nativeRuntimeLicenseTexts.ts'
[System.IO.File]::WriteAllText($contentModulePath, $contentModule, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Downloaded official runtime license files to $destination"

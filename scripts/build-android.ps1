param(
  [switch]$PrebuildOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$androidRoot = Join-Path $repoRoot 'android'
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$jdkRoot = 'C:\Program Files\Android\Android Studio\jbr'
$gradleArgs = @(
  'clean',
  'app:assembleDebug',
  '--no-daemon',
  '--max-workers=1',
  '--no-parallel',
  '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m',
  '-PreactNativeArchitectures=armeabi-v7a'
)

if (-not (Test-Path (Join-Path $jdkRoot 'bin\java.exe'))) {
  throw "Expected Android Studio JDK was not found at $jdkRoot."
}
if (-not (Test-Path (Join-Path $repoRoot 'node_modules\.bin\expo.cmd'))) {
  throw 'Expo dependencies are missing. Run npm install first.'
}
if (-not (Test-Path (Join-Path $repoRoot 'package.json'))) {
  throw "Project package.json is not readable at $repoRoot."
}

$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
$env:CI = '1'
$env:PATH = "$jdkRoot\bin;$sdkRoot\platform-tools;$env:PATH"

Push-Location $repoRoot
try {
  # Match autolinkingOptions.findPackageJsonPathAsync before starting Expo prebuild.
  $packageDiscoveryCheck = "const fs=require('fs'),path=require('path');const root=process.cwd();for(let d=root;path.dirname(d)!==d;d=path.dirname(d)){const f=path.resolve(d,'package.json');if(fs.existsSync(f)){console.log(f);process.exit(0)}}console.error('Expo autolinking found no package.json up from '+root);process.exit(2)"
  & node -e $packageDiscoveryCheck
  if ($LASTEXITCODE -ne 0) { throw "Node could not discover package.json from $repoRoot." }

  & (Join-Path $repoRoot 'node_modules\.bin\expo.cmd') prebuild --platform android --clean
  if ($LASTEXITCODE -ne 0) { throw "Expo prebuild exited with code $LASTEXITCODE." }
} finally {
  Pop-Location
}

if ($PrebuildOnly) { return }

Push-Location $androidRoot
try {
  if (-not (Test-Path -LiteralPath '.\gradlew.bat')) { throw "Gradle wrapper was not generated in $androidRoot." }
  & .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -ne 0) { throw "Gradle exited with code $LASTEXITCODE." }
} finally {
  Pop-Location
}

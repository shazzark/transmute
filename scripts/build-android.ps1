$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$jdkRoot = 'C:\Program Files\Android\Android Studio\jbr'
$buildDrive = @('T:', 'U:', 'V:', 'W:', 'X:', 'Y:', 'Z:') |
  Where-Object { -not (Get-PSDrive -Name $_.TrimEnd(':') -ErrorAction SilentlyContinue) } |
  Select-Object -First 1
if (-not $buildDrive) { throw 'No free temporary drive letter is available for the short-path build.' }
$buildRoot = "$buildDrive\"
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

$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
$env:PATH = "$jdkRoot\bin;$sdkRoot\platform-tools;$env:PATH"

# CMake stores absolute paths in its generated project. Re-create Android from app.json
# on a temporary drive so generated Ninja object paths stay below the Windows path limit.
$env:CI = '1'
& "$env:SystemRoot\System32\subst.exe" $buildDrive $repoRoot
if ($LASTEXITCODE -ne 0) { throw "Could not map $buildDrive to the project directory." }
try {
  $androidRoot = Join-Path $buildRoot 'android'
  Push-Location $buildRoot
  try {
    & (Join-Path $buildRoot 'node_modules\.bin\expo.cmd') prebuild --platform android --clean
    if ($LASTEXITCODE -ne 0) { throw "Expo prebuild exited with code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }

  Push-Location $androidRoot
  try {
    if (-not (Test-Path -LiteralPath '.\gradlew.bat')) { throw "Gradle wrapper was not generated in $androidRoot." }
    & .\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw "Gradle exited with code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
} finally {
  & "$env:SystemRoot\System32\subst.exe" $buildDrive /D
}

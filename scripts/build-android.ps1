param(
  [switch]$PrebuildOnly,
  [switch]$SkipPrebuild,
  [switch]$Release,
  [string]$Architectures = 'armeabi-v7a'
)

$ErrorActionPreference = 'Stop'

if ($PrebuildOnly -and $SkipPrebuild) { throw 'Choose either -PrebuildOnly or -SkipPrebuild, not both.' }
if ($PrebuildOnly -and $Release) { throw '-PrebuildOnly does not build a release APK; omit -Release.' }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$expectedRoot = 'C:\t'
if (-not [string]::Equals($repoRoot, $expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Run the native build from $expectedRoot to keep generated CMake paths below Windows' path limit. Current repository: $repoRoot."
}
$androidRoot = Join-Path $repoRoot 'android'
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

function Backup-GeneratedAndroidProject {
  if (-not (Test-Path -LiteralPath $androidRoot)) { return }

  $recoveryRoot = Join-Path $repoRoot '.local-recovery'
  New-Item -ItemType Directory -Force -Path $recoveryRoot | Out-Null
  $backupName = 'android-before-prebuild-{0}' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
  $backupRoot = Join-Path $recoveryRoot $backupName
  if (Test-Path -LiteralPath $backupRoot) {
    throw "Refusing to overwrite an existing Android backup: $backupRoot"
  }

  New-Item -ItemType Directory -Path $backupRoot | Out-Null
  $excludeDirectories = @(
    (Join-Path $androidRoot '.gradle'),
    (Join-Path $androidRoot '.kotlin'),
    (Join-Path $androidRoot 'build'),
    (Join-Path $androidRoot 'app\build'),
    (Join-Path $androidRoot 'app\.cxx'),
    (Join-Path $androidRoot 'g'),
    (Join-Path $androidRoot 's')
  )
  & robocopy $androidRoot $backupRoot /E /COPY:DAT /R:1 /W:1 /XD $excludeDirectories /XF 'replay_pid*.log' 'hs_err_pid*.log' | Out-Null
  $copyResult = $LASTEXITCODE
  if ($copyResult -ge 8) { throw "Could not back up generated Android files (robocopy exit $copyResult). Prebuild was not started." }

  $previousOutputs = Join-Path $androidRoot 'app\build\outputs'
  if (Test-Path -LiteralPath $previousOutputs) {
    $outputsBackup = Join-Path $backupRoot 'previous-release-outputs'
    New-Item -ItemType Directory -Path $outputsBackup | Out-Null
    & robocopy $previousOutputs $outputsBackup /E /COPY:DAT /R:1 /W:1 | Out-Null
    $outputCopyResult = $LASTEXITCODE
    if ($outputCopyResult -ge 8) { throw "Could not back up prior Android outputs (robocopy exit $outputCopyResult). Prebuild was not started." }
  }
  Write-Host "Backed up generated Android sources and local signing material to $backupRoot"
}

function Find-Temurin17 {
  $candidateRoots = @(
    $env:JAVA_HOME,
    (Join-Path $env:USERPROFILE '.gradle\jdks'),
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Java',
    (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  $candidates = [System.Collections.Generic.List[string]]::new()
  foreach ($root in $candidateRoots) {
    if (Test-Path -LiteralPath (Join-Path $root 'bin\java.exe')) {
      $candidates.Add((Resolve-Path -LiteralPath $root).Path)
    } else {
      Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
        Where-Object Name -Match '(?i)(temurin|adoptium|jdk).*(17)|17.*(temurin|adoptium|jdk)' |
        ForEach-Object {
          if (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe')) { $candidates.Add($_.FullName) }
        }
    }
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    $javaExe = Join-Path $candidate 'bin\java.exe'
    $jvmConfig = Join-Path $candidate 'lib\jvm.cfg'
    if (-not (Test-Path -LiteralPath $jvmConfig)) { continue }
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $javaExe
    $startInfo.Arguments = '-version'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $javaProcess = [System.Diagnostics.Process]::new()
    $javaProcess.StartInfo = $startInfo
    if (-not $javaProcess.Start()) { continue }
    $versionText = $javaProcess.StandardOutput.ReadToEnd() + $javaProcess.StandardError.ReadToEnd()
    $javaProcess.WaitForExit()
    if ($javaProcess.ExitCode -eq 0 -and $versionText -match 'version "17\.' -and $versionText -match '(?i)(temurin|eclipse adoptium)') {
      return $candidate
    }
  }
  return $null
}

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules\.bin\expo.cmd'))) {
  throw 'Expo dependencies are missing. Run npm install first.'
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'package.json'))) {
  throw "Project package.json is not readable at $repoRoot."
}

if (-not $SkipPrebuild) {
  Backup-GeneratedAndroidProject
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
}

$appConfig = Get-Content -LiteralPath (Join-Path $repoRoot 'app.json') -Raw | ConvertFrom-Json
$expectedVersionName = [string]$appConfig.expo.version
$expectedVersionCode = [int]$appConfig.expo.android.versionCode
$appGradlePath = Join-Path $androidRoot 'app\build.gradle'
if (-not (Test-Path -LiteralPath $appGradlePath)) { throw "Expo did not generate $appGradlePath." }
$appGradle = Get-Content -LiteralPath $appGradlePath -Raw
$versionCodeMatch = [regex]::Match($appGradle, '(?m)^\s*versionCode\s+(\d+)\s*$')
$versionNameMatch = [regex]::Match($appGradle, '(?m)^\s*versionName\s+["'']([^"'']+)["'']\s*$')
if (-not $versionCodeMatch.Success -or [int]$versionCodeMatch.Groups[1].Value -ne $expectedVersionCode) {
  throw "Generated Android versionCode does not match app.json (expected $expectedVersionCode). No build was started."
}
if (-not $versionNameMatch.Success -or $versionNameMatch.Groups[1].Value -ne $expectedVersionName) {
  throw "Generated Android versionName does not match app.json (expected $expectedVersionName). No build was started."
}
Write-Host "Verified app/build.gradle versionName=$expectedVersionName versionCode=$expectedVersionCode before Gradle build."

if ($PrebuildOnly) { return }

$jdkRoot = Find-Temurin17
if (-not $jdkRoot) {
  throw 'Temurin 17 was not found. Set JAVA_HOME to a Temurin 17 installation, then rerun the build.'
}
if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot 'platform-tools\adb.exe'))) {
  throw "Android SDK platform tools were not found at $sdkRoot."
}

$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
$env:CI = '1'
$env:PATH = "$jdkRoot\bin;$sdkRoot\platform-tools;$env:PATH"

$signingNames = @(
  'TRANSMUTE_RELEASE_STORE_FILE',
  'TRANSMUTE_RELEASE_STORE_PASSWORD',
  'TRANSMUTE_RELEASE_KEY_ALIAS',
  'TRANSMUTE_RELEASE_KEY_PASSWORD'
)
$previousSigningEnvironment = @{}
foreach ($name in $signingNames) {
  $previousSigningEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

function ConvertTo-PlainTextForChildProcess([System.Security.SecureString]$Secret) {
  $memory = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($memory) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($memory) }
}

try {
  if ($Release) {
    $storePath = $env:TRANSMUTE_RELEASE_STORE_FILE
    if (-not $storePath) { $storePath = Read-Host 'Path to the dedicated release keystore' }
    if (-not $storePath) { throw 'Release keystore path cannot be empty.' }
    if (-not (Test-Path -LiteralPath $storePath -PathType Leaf)) { throw "Release keystore not found: $storePath" }
    $storePath = (Resolve-Path -LiteralPath $storePath).Path

    $keyAlias = $env:TRANSMUTE_RELEASE_KEY_ALIAS
    if (-not $keyAlias) { $keyAlias = Read-Host 'Release key alias' }
    if (-not $keyAlias) { throw 'Release key alias cannot be empty.' }

    $storeSecret = Read-Host 'Release keystore password' -AsSecureString
    $keySecret = Read-Host 'Release key password (enter the same password if the key uses it)' -AsSecureString
    if ($storeSecret.Length -eq 0 -or $keySecret.Length -eq 0) { throw 'Release signing passwords cannot be empty.' }

    [Environment]::SetEnvironmentVariable('TRANSMUTE_RELEASE_STORE_FILE', $storePath, 'Process')
    [Environment]::SetEnvironmentVariable('TRANSMUTE_RELEASE_STORE_PASSWORD', (ConvertTo-PlainTextForChildProcess $storeSecret), 'Process')
    [Environment]::SetEnvironmentVariable('TRANSMUTE_RELEASE_KEY_ALIAS', $keyAlias, 'Process')
    [Environment]::SetEnvironmentVariable('TRANSMUTE_RELEASE_KEY_PASSWORD', (ConvertTo-PlainTextForChildProcess $keySecret), 'Process')
  }

  $gradleArgs = @('--no-daemon', '--max-workers=1', '--no-parallel', "-PreactNativeArchitectures=$Architectures")
  if ($Release) {
    $gradleArgs += @('clean', ':app:assembleRelease')
  } else {
    $gradleArgs += @('clean', ':app:assembleDebug')
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
  foreach ($name in $signingNames) {
    [Environment]::SetEnvironmentVariable($name, $previousSigningEnvironment[$name], 'Process')
  }
}

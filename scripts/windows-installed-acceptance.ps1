[CmdletBinding()]
param(
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$FromVersion = '0.3.0',

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$ToVersion,

  [string]$CandidateDirectory = 'release',

  [string]$EvidenceDirectory = 'release-evidence',

  # Default to the official release asset for FromVersion.
  [uri]$BaselineUri,

  # Default to the pinned hash for FromVersion in scripts/release-baselines.json.
  [ValidatePattern('^[a-fA-F0-9]{64}$')]
  [string]$BaselineSha256,

  [string]$NodeExecutable = 'node',

  [switch]$AllowLocalMachineMutation,

  [switch]$PlanOnly,

  # Exit successfully when FromVersion is not older than ToVersion, so CI can
  # loop over every pinned baseline without special-casing the current release.
  [switch]$SkipIfNotNewer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageVersion = (
  Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw |
    ConvertFrom-Json
).version
if ($ToVersion -ne $packageVersion) {
  throw "ToVersion $ToVersion does not match package.json version $packageVersion"
}
if ([version]$FromVersion -ge [version]$ToVersion) {
  if ($SkipIfNotNewer) {
    Write-Host "Skipping baseline ${FromVersion}: not older than candidate $ToVersion"
    exit 0
  }
  throw 'FromVersion must be lower than ToVersion'
}
if (-not $BaselineUri) {
  $BaselineUri = [uri]"https://github.com/yPinn/Utawakui-Releases/releases/download/v$FromVersion/Utawakui-Setup-$FromVersion.exe"
}
if (-not $BaselineSha256) {
  $pinnedBaselines = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-baselines.json') -Raw |
    ConvertFrom-Json
  $pinnedBaseline = $pinnedBaselines | Where-Object { $_.version -eq $FromVersion }
  if (-not $pinnedBaseline) {
    throw "No pinned baseline for $FromVersion in scripts/release-baselines.json"
  }
  $BaselineSha256 = $pinnedBaseline.sha256
}
$candidateDirectoryPath = if ([System.IO.Path]::IsPathRooted($CandidateDirectory)) {
  [System.IO.Path]::GetFullPath($CandidateDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $CandidateDirectory))
}
$evidenceDirectoryPath = if ([System.IO.Path]::IsPathRooted($EvidenceDirectory)) {
  [System.IO.Path]::GetFullPath($EvidenceDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $EvidenceDirectory))
}
$candidateInstallerName = "Utawakui-Setup-$ToVersion.exe"
$candidateInstallerPath = Join-Path $candidateDirectoryPath $candidateInstallerName
$baselineInstallerName = "Utawakui-Setup-$FromVersion.exe"
$isEphemeralGitHubRunner =
  [string]::Equals($env:CI, 'true', [System.StringComparison]::OrdinalIgnoreCase) -and
  [string]::Equals($env:GITHUB_ACTIONS, 'true', [System.StringComparison]::OrdinalIgnoreCase) -and
  -not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)

function Assert-LeafFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing ${Description}: $Path"
  }
}

function Test-PathIsContained {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Parent,

    [Parameter(Mandatory = $true)]
    [string]$Child
  )

  $parentFullPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $childFullPath = [System.IO.Path]::GetFullPath($Child)
  $prefix = "$parentFullPath$([System.IO.Path]::DirectorySeparatorChar)"
  return $childFullPath.StartsWith(
    $prefix,
    [System.StringComparison]::OrdinalIgnoreCase
  )
}

function Get-UtawakuiRegistryEntries {
  $uninstallPaths = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  return @(
    Get-ItemProperty -Path $uninstallPaths -ErrorAction SilentlyContinue |
      Where-Object {
        $displayName = $_.PSObject.Properties['DisplayName']
        $displayVersion = $_.PSObject.Properties['DisplayVersion']
        $isVersionedProductName =
          $null -ne $displayName -and
          $null -ne $displayVersion -and
          $displayName.Value -eq "Utawakui $($displayVersion.Value)"
        $null -ne $displayName -and (
          $displayName.Value -eq 'Utawakui' -or
          $isVersionedProductName
        )
      }
  )
}

function Get-RegistryInstallBinding {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Entry
  )

  $values = foreach ($propertyName in @(
    'InstallLocation',
    'UninstallString',
    'QuietUninstallString',
    'DisplayIcon'
  )) {
    $property = $Entry.PSObject.Properties[$propertyName]
    if ($null -ne $property -and $null -ne $property.Value) {
      [string]$property.Value
    }
  }
  return $values -join ' '
}

function Get-UtawakuiProcesses {
  return @(
    Get-CimInstance Win32_Process -ErrorAction Stop |
      Where-Object {
        $_.Name -in @('electron.exe', 'Utawakui.exe') -and
        (
          $_.ExecutablePath -like '*Utawakui*' -or
          $_.CommandLine -like '*Utawakui*'
        )
      }
  )
}

function Get-ShortcutPaths {
  $programs = [Environment]::GetFolderPath(
    [System.Environment+SpecialFolder]::Programs
  )
  $desktop = [Environment]::GetFolderPath(
    [System.Environment+SpecialFolder]::DesktopDirectory
  )
  $commonDesktop = [Environment]::GetFolderPath(
    [System.Environment+SpecialFolder]::CommonDesktopDirectory
  )
  $paths = @()
  if (-not [string]::IsNullOrWhiteSpace($programs)) {
    $paths += Join-Path $programs 'Utawakui.lnk'
    $paths += Join-Path $programs 'Utawakui\Utawakui.lnk'
  }
  if (-not [string]::IsNullOrWhiteSpace($desktop)) {
    $paths += Join-Path $desktop 'Utawakui.lnk'
  }
  if (-not [string]::IsNullOrWhiteSpace($commonDesktop)) {
    $paths += Join-Path $commonDesktop 'Utawakui.lnk'
  }
  return @($paths | Select-Object -Unique)
}

function Get-ExistingState {
  $paths = @(
    (Join-Path $env:APPDATA 'Utawakui'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Utawakui')
  ) + (Get-ShortcutPaths)
  $existingPaths = @($paths | Where-Object { Test-Path -LiteralPath $_ })
  $processes = @()
  $processInspectionError = $null
  try {
    $processes = @(Get-UtawakuiProcesses)
  } catch {
    $processInspectionError = $_.Exception.Message
  }
  $registryEntries = @(Get-UtawakuiRegistryEntries)
  $blockers = @()
  if ($null -ne $processInspectionError) {
    $blockers += 'unable to inspect running Windows processes'
  }
  if ($processes.Count -gt 0) {
    $blockers += 'running Utawakui process'
  }
  if ($registryEntries.Count -gt 0) {
    $blockers += 'existing Utawakui uninstall registry entry'
  }
  if ($existingPaths.Count -gt 0) {
    $blockers += 'existing Utawakui data, install directory, or shortcut'
  }
  return [pscustomobject]@{
    blockers = $blockers
    processCount = $processes.Count
    processInspectionError = $processInspectionError
    registryEntryCount = $registryEntries.Count
    existingPathCount = $existingPaths.Count
  }
}

function Assert-BaselineSource {
  $expectedPath =
    "/yPinn/Utawakui-Releases/releases/download/v$FromVersion/$baselineInstallerName"
  if (
    $BaselineUri.Scheme -ne 'https' -or
    $BaselineUri.Host -ne 'github.com' -or
    $BaselineUri.AbsolutePath -ne $expectedPath
  ) {
    throw "BaselineUri must be the exact official v$FromVersion GitHub release asset"
  }
}

function Invoke-Installer {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath,

    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  $process = Start-Process `
    -FilePath $InstallerPath `
    -ArgumentList @('/S', '/currentuser', "/D=$InstallRoot") `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Installer failed with exit code $($process.ExitCode)"
  }
}

function Get-InstalledEvidence {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedVersion
  )

  $executablePath = Join-Path $InstallRoot 'electron.exe'
  Assert-LeafFile -Path $executablePath -Description 'installed executable'
  $versionInfo = (Get-Item -LiteralPath $executablePath).VersionInfo
  $acceptedVersions = @($ExpectedVersion, "$ExpectedVersion.0")
  if ($versionInfo.ProductVersion -notin $acceptedVersions) {
    throw "Installed ProductVersion mismatch: $($versionInfo.ProductVersion)"
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $executablePath
  if ($signature.Status -ne 'NotSigned') {
    throw "Installed executable has unexpected Authenticode status: $($signature.Status)"
  }

  $registryEntry = @(
    Get-UtawakuiRegistryEntries |
      Where-Object { $_.DisplayVersion -in $acceptedVersions }
  ) | Select-Object -First 1
  if ($null -eq $registryEntry) {
    throw "Missing Utawakui $ExpectedVersion uninstall registry entry"
  }
  $registryBinding = Get-RegistryInstallBinding -Entry $registryEntry
  if ($registryBinding -notlike "*$InstallRoot*") {
    throw 'Uninstall registry entry is not bound to the isolated install root'
  }

  $shortcutPaths = Get-ShortcutPaths
  $existingShortcuts = @($shortcutPaths | Where-Object { Test-Path -LiteralPath $_ })
  $programsRoot = [Environment]::GetFolderPath(
    [System.Environment+SpecialFolder]::Programs
  )
  if (-not ($existingShortcuts | Where-Object { Test-PathIsContained $programsRoot $_ })) {
    throw 'Installed Start Menu shortcut is missing'
  }

  return [pscustomobject]@{
    expectedVersion = $ExpectedVersion
    productVersion = $versionInfo.ProductVersion
    fileVersion = $versionInfo.FileVersion
    authenticode = $signature.Status.ToString()
    executableSha256 = (
      Get-FileHash -LiteralPath $executablePath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    registryDisplayVersion = $registryEntry.DisplayVersion
    shortcutNames = @($existingShortcuts | ForEach-Object {
      Split-Path -Leaf $_
    } | Select-Object -Unique)
  }
}

function Stop-IsolatedProcesses {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_.ExecutablePath) -and
    (Test-PathIsContained -Parent $InstallRoot -Child $_.ExecutablePath)
  })
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
  }
}

function Invoke-IsolatedCleanup {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TemporaryRoot,

    [Parameter(Mandatory = $true)]
    [string]$TemporaryParent,

    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  Stop-IsolatedProcesses -InstallRoot $InstallRoot
  if (Test-Path -LiteralPath $InstallRoot -PathType Container) {
    $uninstallers = @(
      Get-ChildItem -LiteralPath $InstallRoot -Filter 'Uninstall*.exe' -File
    )
    if ($uninstallers.Count -gt 1) {
      throw 'More than one isolated Utawakui uninstaller was found'
    }
    if ($uninstallers.Count -eq 1) {
      $uninstaller = Start-Process `
        -FilePath $uninstallers[0].FullName `
        -ArgumentList @('/S', '/currentuser') `
        -Wait `
        -PassThru `
        -WindowStyle Hidden
      if ($uninstaller.ExitCode -ne 0) {
        throw "Uninstaller failed with exit code $($uninstaller.ExitCode)"
      }
    }
  }

  $remainingRegistryEntries = @(Get-UtawakuiRegistryEntries | Where-Object {
    (Get-RegistryInstallBinding -Entry $_) -like "*$InstallRoot*"
  })
  if ($remainingRegistryEntries.Count -gt 0) {
    throw 'Isolated uninstall registry entry remained after cleanup'
  }

  if (-not (Test-PathIsContained -Parent $TemporaryParent -Child $TemporaryRoot)) {
    throw 'Refusing to remove a temporary root outside the selected temp directory'
  }
  if (Test-Path -LiteralPath $TemporaryRoot) {
    Remove-Item -LiteralPath $TemporaryRoot -Recurse -Force
  }
}

Assert-LeafFile -Path $candidateInstallerPath -Description 'candidate installer'
Assert-BaselineSource
$existingState = Get-ExistingState
$mutationAuthorized = $isEphemeralGitHubRunner -or $AllowLocalMachineMutation.IsPresent

if ($PlanOnly) {
  [pscustomobject]@{
    schemaVersion = 1
    mode = 'plan-only'
    fromVersion = $FromVersion
    toVersion = $ToVersion
    candidateInstaller = $candidateInstallerName
    baselineUri = $BaselineUri.AbsoluteUri
    baselineSha256 = $BaselineSha256.ToLowerInvariant()
    evidenceDirectory = $evidenceDirectoryPath
    ephemeralGitHubRunner = $isEphemeralGitHubRunner
    localMutationOptIn = $AllowLocalMachineMutation.IsPresent
    mutationAuthorized = $mutationAuthorized
    blockers = $existingState.blockers
    wouldRun = $mutationAuthorized -and $existingState.blockers.Count -eq 0
  } | ConvertTo-Json -Depth 4
  exit 0
}

if (-not $mutationAuthorized) {
  throw 'Installed acceptance mutates Windows installation state; use an ephemeral GitHub Actions runner or explicitly pass -AllowLocalMachineMutation'
}
if ($existingState.blockers.Count -gt 0) {
  throw "Installed acceptance refused existing machine state: $($existingState.blockers -join '; ')"
}
if (Test-Path -LiteralPath $evidenceDirectoryPath) {
  if (@(Get-ChildItem -LiteralPath $evidenceDirectoryPath -Force).Count -gt 0) {
    throw "Evidence directory must be new or empty: $evidenceDirectoryPath"
  }
} else {
  New-Item -ItemType Directory -Path $evidenceDirectoryPath | Out-Null
}

$temporaryParent = if ($isEphemeralGitHubRunner) {
  [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
} else {
  [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
}
$temporaryRoot = Join-Path $temporaryParent (
  "utawakui-installed-acceptance-$([guid]::NewGuid().ToString('N'))"
)
if (-not (Test-PathIsContained -Parent $temporaryParent -Child $temporaryRoot)) {
  throw 'Temporary acceptance root escaped the selected temp directory'
}
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
$installRoot = Join-Path $temporaryRoot 'install'
$roamingRoot = Join-Path $temporaryRoot 'appdata\roaming'
$localRoot = Join-Path $temporaryRoot 'appdata\local'
$downloadRoot = Join-Path $temporaryRoot 'download'
$baselineInstallerPath = Join-Path $downloadRoot $baselineInstallerName
if (-not (Test-PathIsContained -Parent $temporaryRoot -Child $installRoot)) {
  throw 'Isolated install root escaped the temporary acceptance root'
}
$startupEvidenceRoot = Join-Path $evidenceDirectoryPath 'startup'
$originalEnvironment = @{
  APPDATA = $env:APPDATA
  LOCALAPPDATA = $env:LOCALAPPDATA
  TEMP = $env:TEMP
  TMP = $env:TMP
}
$stage = 'initialize'
$operationError = $null
$cleanupError = $null
$failureStage = $null
$successEvidence = $null

try {
  foreach ($directory in @($roamingRoot, $localRoot, $downloadRoot)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }
  $env:APPDATA = $roamingRoot
  $env:LOCALAPPDATA = $localRoot
  $env:TEMP = $temporaryRoot
  $env:TMP = $temporaryRoot

  $stage = 'verify-candidate-bundle'
  & (Join-Path $PSScriptRoot 'verify-unsigned-windows-package.ps1') `
    -Version $ToVersion `
    -ReleaseDirectory $candidateDirectoryPath `
    -WriteChecksum `
    -NodeExecutable $NodeExecutable

  $stage = 'collect-update-contract-evidence'
  & $NodeExecutable `
    (Join-Path $PSScriptRoot 'update-acceptance-evidence.mjs') `
    --from-version $FromVersion `
    --to-version $ToVersion `
    --directory $candidateDirectoryPath `
    --out (Join-Path $evidenceDirectoryPath 'update-acceptance.json')
  if ($LASTEXITCODE -ne 0) {
    throw 'Update contract evidence collection failed'
  }

  $stage = 'download-baseline'
  Invoke-WebRequest `
    -UseBasicParsing `
    -Uri $BaselineUri `
    -OutFile $baselineInstallerPath
  $actualBaselineHash = (
    Get-FileHash -LiteralPath $baselineInstallerPath -Algorithm SHA256
  ).Hash.ToLowerInvariant()
  if ($actualBaselineHash -ne $BaselineSha256.ToLowerInvariant()) {
    throw 'Official baseline installer SHA-256 mismatch'
  }
  $baselineSignature = Get-AuthenticodeSignature -LiteralPath $baselineInstallerPath
  if ($baselineSignature.Status -ne 'NotSigned') {
    throw "Baseline installer has unexpected Authenticode status: $($baselineSignature.Status)"
  }

  $stage = 'install-baseline'
  Invoke-Installer -InstallerPath $baselineInstallerPath -InstallRoot $installRoot
  $baselineEvidence = Get-InstalledEvidence `
    -InstallRoot $installRoot `
    -ExpectedVersion $FromVersion

  $stage = 'seed-retention-sentinels'
  $userDataRoot = Join-Path $roamingRoot 'Utawakui'
  $librarySentinelRoot = Join-Path $userDataRoot 'library\acceptance-track'
  New-Item -ItemType Directory -Path $librarySentinelRoot | Out-Null
  $settingsSentinel = Join-Path $userDataRoot 'acceptance-settings.keep'
  $librarySentinel = Join-Path $librarySentinelRoot 'source.keep'
  [System.IO.File]::WriteAllText($settingsSentinel, "settings-$([guid]::NewGuid())")
  [System.IO.File]::WriteAllText($librarySentinel, "library-$([guid]::NewGuid())")
  $sentinelHashes = @{
    settings = (Get-FileHash -LiteralPath $settingsSentinel -Algorithm SHA256).Hash
    library = (Get-FileHash -LiteralPath $librarySentinel -Algorithm SHA256).Hash
  }

  $stage = 'upgrade-candidate'
  Invoke-Installer -InstallerPath $candidateInstallerPath -InstallRoot $installRoot
  $candidateEvidence = Get-InstalledEvidence `
    -InstallRoot $installRoot `
    -ExpectedVersion $ToVersion
  foreach ($sentinel in @(
    @{ Name = 'settings'; Path = $settingsSentinel },
    @{ Name = 'library'; Path = $librarySentinel }
  )) {
    Assert-LeafFile -Path $sentinel.Path -Description "$($sentinel.Name) retention sentinel"
    $currentHash = (Get-FileHash -LiteralPath $sentinel.Path -Algorithm SHA256).Hash
    if ($currentHash -ne $sentinelHashes[$sentinel.Name]) {
      throw "$($sentinel.Name) retention sentinel changed during upgrade"
    }
  }

  $stage = 'installed-startup'
  & $NodeExecutable `
    (Join-Path $PSScriptRoot 'startup-performance.mjs') `
    --exe (Join-Path $installRoot 'electron.exe') `
    --output $startupEvidenceRoot `
    --cold-runs 1 `
    --warm-runs 1 `
    --timeout-ms 90000
  if ($LASTEXITCODE -ne 0) {
    throw 'Installed startup acceptance failed'
  }

  $successEvidence = [ordered]@{
    schemaVersion = 1
    status = 'verified'
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    upgradePath = [ordered]@{
      fromVersion = $FromVersion
      toVersion = $ToVersion
    }
    baseline = [ordered]@{
      source = 'official-public-release'
      installerName = $baselineInstallerName
      sha256 = $actualBaselineHash
      authenticode = $baselineSignature.Status.ToString()
      installed = $baselineEvidence
    }
    candidate = [ordered]@{
      source = 'same-run-ci-artifact'
      installerName = $candidateInstallerName
      sha256 = (
        Get-FileHash -LiteralPath $candidateInstallerPath -Algorithm SHA256
      ).Hash.ToLowerInvariant()
      installed = $candidateEvidence
    }
    checks = [ordered]@{
      sameInstallRootUpgrade = 'verified'
      settingsRetention = 'verified'
      libraryRetention = 'verified'
      installedStartup = 'verified'
      uninstallCleanup = 'pending'
      productionFeedUpdate = 'pending-manual'
    }
  }
} catch {
  $operationError = $_
  $failureStage = $stage
} finally {
  try {
    $stage = 'cleanup'
    Invoke-IsolatedCleanup `
      -TemporaryRoot $temporaryRoot `
      -TemporaryParent $temporaryParent `
      -InstallRoot $installRoot
  } catch {
    $cleanupError = $_
  } finally {
    $env:APPDATA = $originalEnvironment.APPDATA
    $env:LOCALAPPDATA = $originalEnvironment.LOCALAPPDATA
    $env:TEMP = $originalEnvironment.TEMP
    $env:TMP = $originalEnvironment.TMP
  }
}

if ($null -ne $cleanupError -and $null -eq $operationError) {
  $operationError = $cleanupError
  $failureStage = 'cleanup'
}
if ($null -ne $operationError) {
  $failureEvidence = [ordered]@{
    schemaVersion = 1
    status = 'failed'
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    stage = $failureStage
    message = $operationError.Exception.Message
    cleanup = if ($null -eq $cleanupError) { 'completed' } else { 'failed' }
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $evidenceDirectoryPath 'installed-acceptance-failure.json'),
    "$($failureEvidence | ConvertTo-Json -Depth 5)`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  throw $operationError
}

$successEvidence.checks.uninstallCleanup = 'verified'
[System.IO.File]::WriteAllText(
  (Join-Path $evidenceDirectoryPath 'installed-acceptance.json'),
  "$($successEvidence | ConvertTo-Json -Depth 8)`n",
  [System.Text.UTF8Encoding]::new($false)
)
Write-Host "Verified installed Windows upgrade from $FromVersion to $ToVersion"

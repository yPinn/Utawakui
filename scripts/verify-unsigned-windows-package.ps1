[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,

  [switch]$WriteChecksum,

  [string]$NodeExecutable = 'node'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDirectory = Join-Path $projectRoot 'release'
$installerName = "Utawakui-Setup-$Version.exe"
$installer = Join-Path $releaseDirectory $installerName
$executable = Join-Path $releaseDirectory 'win-unpacked/electron.exe'

foreach ($file in @($installer, $executable)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Missing unsigned file: $file"
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne 'NotSigned') {
    throw "Unexpected Authenticode status for ${file}: $($signature.Status)"
  }
}

$productVersion = (Get-Item -LiteralPath $executable).VersionInfo.ProductVersion
$acceptedVersions = @($Version, "$Version.0")
if ($productVersion -notin $acceptedVersions) {
  throw "Packaged version mismatch: $productVersion"
}

$asarPath = Join-Path $releaseDirectory 'win-unpacked/resources/app.asar'
if (-not (Test-Path -LiteralPath $asarPath -PathType Leaf)) {
  throw 'Missing packaged app.asar'
}

Push-Location $projectRoot
try {
  $listing = & $NodeExecutable node_modules/@electron/asar/bin/asar.js list $asarPath
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect packaged app.asar'
  }
  foreach ($requiredNotice in @('LICENSE.md', 'THIRD_PARTY_NOTICES.md')) {
    $escapedName = [regex]::Escape($requiredNotice)
    $notice = $listing | Where-Object { $_ -match "[/\\]$escapedName$" }
    if (-not $notice) {
      throw "$requiredNotice is not packaged"
    }
  }

  & $NodeExecutable scripts/release-contract-cli.mjs artifacts --version $Version
  if ($LASTEXITCODE -ne 0) {
    throw 'Unsigned update artifact contract failed'
  }
} finally {
  Pop-Location
}

if ($WriteChecksum) {
  $hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content `
    -LiteralPath (Join-Path $releaseDirectory 'SHA256SUMS.txt') `
    -Value "$hash  $installerName" `
    -Encoding utf8NoBOM
}

Write-Host "Verified unsigned Windows package for Utawakui $Version"

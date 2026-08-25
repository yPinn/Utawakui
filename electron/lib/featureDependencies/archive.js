'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { dependencyDownloadLabel } = require('./download');

function zipEntrySegments(entryName) {
  return String(entryName).replaceAll('\\', '/').split('/').filter(Boolean);
}

function validateZipEntryName(entryName, destinationDir, dependency) {
  const normalizedName = String(entryName || '');
  const label = dependencyDownloadLabel(dependency);
  if (
    normalizedName.length === 0 ||
    path.isAbsolute(normalizedName) ||
    path.win32.isAbsolute(normalizedName) ||
    zipEntrySegments(normalizedName).includes('..')
  ) {
    throw new Error(
      `Archive entry extracts outside the destination for ${label}: ${normalizedName}`,
    );
  }

  const resolvedDestination = path.resolve(destinationDir);
  const resolvedEntry = path.resolve(resolvedDestination, normalizedName);
  const relative = path.relative(resolvedDestination, resolvedEntry);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Archive entry extracts outside the destination for ${label}: ${normalizedName}`,
    );
  }
}

function findZipEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function validateZipArchiveBuffer(buffer, destinationDir, dependency) {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) {
    throw new Error(
      `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
    );
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryOffset < 0 ||
    centralDirectoryEnd > eocdOffset ||
    centralDirectoryEnd > buffer.length
  ) {
    throw new Error(
      `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
    );
  }

  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > centralDirectoryEnd) {
      throw new Error(
        `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
      );
    }
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(
        `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
      );
    }

    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const filenameStart = offset + 46;
    const filenameEnd = filenameStart + filenameLength;
    if (filenameEnd > centralDirectoryEnd) {
      throw new Error(
        `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
      );
    }
    validateZipEntryName(
      buffer.toString('utf8', filenameStart, filenameEnd),
      destinationDir,
      dependency,
    );
    offset = filenameEnd + extraLength + commentLength;
  }
}

function resolvePowerShellPath() {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const windowsPowerShell = path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  return fs.existsSync(windowsPowerShell)
    ? windowsPowerShell
    : 'powershell.exe';
}

function expandZipArchive(
  archivePath,
  destinationDir,
  _dependency,
  options = {},
) {
  return new Promise((resolve, reject) => {
    const spawnImpl = options.spawnImpl || spawn;
    const proc = spawnImpl(resolvePowerShellPath(), [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      [
        '& {',
        'param([string]$ArchivePath, [string]$DestinationPath)',
        "$ErrorActionPreference = 'Stop'",
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        '$root = [System.IO.Path]::GetFullPath($DestinationPath)',
        'if (-not $root.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {',
        '$root = $root + [System.IO.Path]::DirectorySeparatorChar',
        '}',
        '$archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)',
        'try {',
        'foreach ($entry in $archive.Entries) {',
        '$target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($DestinationPath, $entry.FullName));',
        'if (-not $target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {',
        'throw "Archive entry extracts outside the destination: $($entry.FullName)"',
        '}',
        '$ioTarget = if ($target.StartsWith("\\\\")) { "\\\\?\\UNC\\" + $target.Substring(2) } else { "\\\\?\\" + $target }',
        'if ($entry.FullName.EndsWith("/") -or $entry.FullName.EndsWith("\\")) {',
        '[System.IO.Directory]::CreateDirectory($ioTarget) | Out-Null',
        'continue',
        '}',
        '$parent = [System.IO.Path]::GetDirectoryName($target)',
        'if ($parent) {',
        '$ioParent = if ($parent.StartsWith("\\\\")) { "\\\\?\\UNC\\" + $parent.Substring(2) } else { "\\\\?\\" + $parent }',
        '[System.IO.Directory]::CreateDirectory($ioParent) | Out-Null',
        '}',
        '$inputStream = $entry.Open()',
        'try {',
        '$outputStream = [System.IO.File]::Open($ioTarget, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)',
        'try {',
        '$inputStream.CopyTo($outputStream)',
        '} finally {',
        '$outputStream.Dispose()',
        '}',
        '} finally {',
        '$inputStream.Dispose()',
        '}',
        '}',
        '} finally {',
        '$archive.Dispose()',
        '}',
        '}',
      ].join('\n'),
      archivePath,
      destinationDir,
    ]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `failed to extract feature dependency archive (code ${code}): ${stderr}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  expandZipArchive,
  validateZipArchiveBuffer,
};

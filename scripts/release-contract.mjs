import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import * as yaml from 'js-yaml';
import semver from 'semver';

function assertContract(condition, message) {
  if (!condition) throw new Error(`[release] ${message}`);
}

function fileSize(filePath, label) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    throw new Error(`[release] Missing ${label}: ${filePath}`);
  }
  assertContract(
    stats.isFile() && stats.size > 0,
    `${label} must be non-empty`,
  );
  return stats.size;
}

function sha512(filePath) {
  return createHash('sha512')
    .update(fs.readFileSync(filePath))
    .digest('base64');
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function verifyBlockmap(blockmapPath, installerSize) {
  let blockmap;
  try {
    blockmap = JSON.parse(gunzipSync(fs.readFileSync(blockmapPath)).toString());
  } catch (error) {
    throw new Error(`[release] Invalid blockmap: ${error.message}`, {
      cause: error,
    });
  }

  assertContract(isPlainObject(blockmap), 'blockmap must contain an object');
  assertContract(
    blockmap.version === '1' || blockmap.version === '2',
    'blockmap version is unsupported',
  );
  assertContract(
    Array.isArray(blockmap.files) && blockmap.files.length === 1,
    'blockmap must describe exactly one installer file',
  );

  const [installerEntry] = blockmap.files;
  assertContract(
    isPlainObject(installerEntry) &&
      installerEntry.name === 'file' &&
      installerEntry.offset === 0,
    'blockmap installer entry is invalid',
  );
  assertContract(
    Array.isArray(installerEntry.checksums) &&
      Array.isArray(installerEntry.sizes) &&
      installerEntry.checksums.length > 0 &&
      installerEntry.checksums.length === installerEntry.sizes.length,
    'blockmap chunks are invalid',
  );
  assertContract(
    installerEntry.checksums.every(
      (checksum) => typeof checksum === 'string' && checksum.length > 0,
    ) &&
      installerEntry.sizes.every(
        (size) => Number.isSafeInteger(size) && size > 0,
      ),
    'blockmap chunk values are invalid',
  );

  const coveredSize = installerEntry.sizes.reduce(
    (total, size) => total + size,
    0,
  );
  assertContract(
    coveredSize === installerSize,
    'blockmap does not cover the installer size',
  );
}

export function verifyVersionContract({ tag, packageJson, packageLock }) {
  const version = packageJson?.version;
  assertContract(
    typeof version === 'string' &&
      semver.valid(version) === version &&
      semver.prerelease(version) === null,
    'package.json must contain a stable semantic version',
  );
  assertContract(tag === `v${version}`, `tag must exactly equal v${version}`);
  assertContract(
    packageLock?.version === version,
    'package-lock.json top-level version must match package.json',
  );
  assertContract(
    packageLock?.packages?.['']?.version === version,
    'package-lock.json root package version must match package.json',
  );
  return version;
}

export function verifyReleaseNotes(notesPath) {
  let notes;
  try {
    notes = fs.readFileSync(notesPath, 'utf8');
  } catch {
    throw new Error(`[release] Missing release notes: ${notesPath}`);
  }
  assertContract(notes.trim().length > 0, 'release notes must not be empty');
  return notesPath;
}

export function verifyArtifactContract({ directory, version }) {
  assertContract(
    semver.valid(version) === version,
    'artifact version is invalid',
  );

  const installerName = `Utawakui-Setup-${version}.exe`;
  const installerPath = path.join(directory, installerName);
  const blockmapPath = `${installerPath}.blockmap`;
  const metadataPath = path.join(directory, 'latest.yml');
  const installerSize = fileSize(installerPath, 'installer');
  const blockmapSize = fileSize(blockmapPath, 'blockmap');
  verifyBlockmap(blockmapPath, installerSize);
  fileSize(metadataPath, 'update metadata');

  let metadata;
  try {
    metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'), {
      schema: yaml.JSON_SCHEMA,
    });
  } catch (error) {
    throw new Error(`[release] Invalid latest.yml: ${error.message}`, {
      cause: error,
    });
  }

  assertContract(isPlainObject(metadata), 'latest.yml must contain an object');
  assertContract(metadata.version === version, 'latest.yml version mismatch');
  assertContract(metadata.path === installerName, 'latest.yml path mismatch');
  assertContract(Array.isArray(metadata.files), 'latest.yml files are missing');

  const installerEntry = metadata.files.find(
    (entry) => isPlainObject(entry) && entry.url === installerName,
  );
  assertContract(installerEntry, 'latest.yml installer entry is missing');
  assertContract(
    installerEntry.size === installerSize,
    'latest.yml installer size mismatch',
  );
  if (installerEntry.blockMapSize != null) {
    assertContract(
      installerEntry.blockMapSize === blockmapSize,
      'latest.yml blockmap size mismatch',
    );
  }

  const installerSha512 = sha512(installerPath);
  assertContract(
    installerEntry.sha512 === installerSha512,
    'latest.yml installer SHA-512 mismatch',
  );
  assertContract(
    metadata.sha512 === installerSha512,
    'latest.yml top-level SHA-512 mismatch',
  );

  return {
    blockmapPath,
    blockmapSize,
    installerName,
    installerPath,
    installerSize,
    metadataPath,
    version,
  };
}

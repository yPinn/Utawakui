#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  verifyManifest,
} = require('../../electron/lib/updateManifestVerification.js');

function parseArgs(argv) {
  const args = { requiredKeyIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') args.version = argv[++index];
    else if (arg === '--expected-key-id') args.expectedKeyId = argv[++index];
    else if (arg === '--required-key-id')
      args.requiredKeyIds.push(argv[++index]);
    else if (arg === '--manifest') args.manifestPath = argv[++index];
    else if (arg === '--registry') args.registryPath = argv[++index];
    else if (arg === '--artifact-dir') args.artifactDirectory = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (
    !args.version ||
    !/^[0-9a-f]{64}$/u.test(args.expectedKeyId || '') ||
    args.requiredKeyIds.some((keyId) => !/^[0-9a-f]{64}$/u.test(keyId || '')) ||
    new Set(args.requiredKeyIds).size !== args.requiredKeyIds.length ||
    !args.manifestPath ||
    !args.registryPath ||
    !args.artifactDirectory
  ) {
    throw new Error(
      'Usage: verify-manifest.mjs --version <semver> ' +
        '--expected-key-id <sha256> [--required-key-id <sha256>] ' +
        '--manifest <path> --registry <path> ' +
        '--artifact-dir <path>',
    );
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha512(filePath) {
  return createHash('sha512').update(readFileSync(filePath)).digest('hex');
}

function verifyDeclaredArtifacts(manifest, artifactDirectory, version) {
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.length > 16
  ) {
    throw new Error('Signed manifest has an invalid files list');
  }
  const root = path.resolve(artifactDirectory);
  const expectedInstaller = `Utawakui-Setup-${version}.exe`;
  if (!manifest.files.some((entry) => entry?.name === expectedInstaller)) {
    throw new Error('Signed manifest does not declare the release installer');
  }

  const names = new Set();
  for (const entry of manifest.files) {
    if (
      typeof entry?.name !== 'string' ||
      entry.name.length === 0 ||
      entry.name !== path.basename(entry.name) ||
      names.has(entry.name) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size <= 0 ||
      !/^[0-9a-f]{128}$/u.test(entry.sha512)
    ) {
      throw new Error('Signed manifest contains invalid artifact metadata');
    }
    names.add(entry.name);
    const artifactPath = path.resolve(root, entry.name);
    if (path.dirname(artifactPath) !== root) {
      throw new Error(
        'Signed manifest artifact path escapes the release directory',
      );
    }
    const stat = statSync(artifactPath);
    if (
      !stat.isFile() ||
      stat.size !== entry.size ||
      sha512(artifactPath) !== entry.sha512
    ) {
      throw new Error(`Signed artifact does not match manifest: ${entry.name}`);
    }
  }
}

export function verifySignedManifestArtifacts({
  version,
  expectedKeyId,
  requiredKeyIds = [],
  manifestPath,
  registry,
  registryPath,
  artifactDirectory,
}) {
  const requiredSigners = [expectedKeyId, ...requiredKeyIds];
  if (
    requiredSigners.some((keyId) => !/^[0-9a-f]{64}$/u.test(keyId || '')) ||
    new Set(requiredSigners).size !== requiredSigners.length
  ) {
    throw new Error(
      'Required update signing key ids are invalid or duplicated',
    );
  }
  const manifest = readJson(manifestPath);
  const trustedRegistry = registry || readJson(registryPath);
  if (manifest.version !== version) {
    throw new Error('Signed manifest version does not match release version');
  }
  if (
    !Array.isArray(manifest.signatures) ||
    !manifest.signatures.some((entry) => entry?.keyId === expectedKeyId)
  ) {
    throw new Error(
      'Signed manifest does not contain the active production key signature',
    );
  }
  const signature = verifyManifest(manifest, trustedRegistry, {
    requiredEnvironment: 'production',
  });
  if (!signature.ok) {
    throw new Error(`Signed manifest verification failed: ${signature.reason}`);
  }
  if (!signature.verifiedKeyIds.includes(expectedKeyId)) {
    throw new Error('Active production key signature did not verify');
  }
  for (const requiredKeyId of requiredKeyIds) {
    if (
      !manifest.signatures.some((entry) => entry?.keyId === requiredKeyId) ||
      !signature.verifiedKeyIds.includes(requiredKeyId)
    ) {
      throw new Error(
        `Required production key signature did not verify: ${requiredKeyId}`,
      );
    }
  }
  verifyDeclaredArtifacts(manifest, artifactDirectory, version);
  return {
    manifest,
    verifiedKeyIds: [expectedKeyId, ...requiredKeyIds],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  verifySignedManifestArtifacts(args);
  process.stdout.write(
    `Verified signed update manifest for ${args.version} with keys ${[
      args.expectedKeyId,
      ...args.requiredKeyIds,
    ].join(',')}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error?.message || 'Manifest verification failed'}\n`,
    );
    process.exitCode = 1;
  }
}

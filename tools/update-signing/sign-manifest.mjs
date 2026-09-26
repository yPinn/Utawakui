#!/usr/bin/env node
'use strict';

// Local tool: builds and signs update-manifest.json for one release. Never
// runs as part of the app or CI in this round — see
// docs/adr/0018-signed-update-manifest.md for what's deliberately deferred.
//
// Usage:
//   node tools/update-signing/sign-manifest.mjs \
//     --version 0.4.0 \
//     --release-date 2026-10-01T00:00:00.000Z \
//     --private-key tools/update-signing/.local/dev-private-key.pem \
//     --out update-manifest.json \
//     release/Utawakui-Setup-0.4.0.exe

import { createRequire } from 'node:module';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
} from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  canonicalizeManifest,
  deriveUpdateSigningKeyId,
} = require('../../electron/lib/updateManifestVerification.js');

function parseArgs(argv) {
  const args = { files: [], privateKeyPaths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version') args.version = argv[++i];
    else if (arg === '--expected-key-id') args.expectedKeyId = argv[++i];
    else if (arg === '--release-date') args.releaseDate = argv[++i];
    else if (arg === '--private-key') args.privateKeyPaths.push(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else args.files.push(arg);
  }
  return args;
}

function sha512Of(filePath) {
  const buffer = readFileSync(filePath);
  return createHash('sha512').update(buffer).digest('hex');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (
    !args.version ||
    (args.expectedKeyId !== undefined &&
      !/^[0-9a-f]{64}$/u.test(args.expectedKeyId)) ||
    args.privateKeyPaths.length === 0 ||
    args.privateKeyPaths.length > 8 ||
    args.files.length === 0
  ) {
    console.error(
      'Usage: sign-manifest.mjs --version <semver> --private-key <path> ' +
        '[--expected-key-id <sha256>] ' +
        '[--release-date <iso>] [--out <path>] <file...>',
    );
    process.exit(1);
  }

  const signingKeys = args.privateKeyPaths.map((privateKeyPath) => {
    const privateKey = createPrivateKey(readFileSync(privateKeyPath));
    const publicKeyHex = createPublicKey(privateKey)
      .export({ type: 'spki', format: 'der' })
      .toString('hex');
    return {
      keyId: deriveUpdateSigningKeyId(publicKeyHex),
      privateKey,
    };
  });
  const signingKeyIds = new Set(signingKeys.map((entry) => entry.keyId));
  if (signingKeyIds.size !== signingKeys.length) {
    console.error('Duplicate update signing private keys were provided');
    process.exit(1);
  }
  if (args.expectedKeyId && !signingKeyIds.has(args.expectedKeyId)) {
    console.error(
      'Provided private keys do not match expected registry key id ' +
        args.expectedKeyId,
    );
    process.exit(1);
  }

  const files = args.files.map((filePath) => ({
    name: path.basename(filePath),
    size: statSync(filePath).size,
    sha512: sha512Of(filePath),
  }));

  const manifest = {
    schemaVersion: 2,
    version: args.version,
    releaseDate: args.releaseDate || new Date().toISOString(),
    files,
  };

  const canonicalBytes = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  // Ed25519 does not take a digest algorithm — pass null, matching Node's
  // documented API for this key type (same reasoning as verifyManifest()).
  const signedManifest = {
    ...manifest,
    signatures: signingKeys.map(({ keyId, privateKey }) => ({
      keyId,
      algorithm: 'ed25519',
      signature: signBytes(null, canonicalBytes, privateKey).toString('hex'),
    })),
  };

  const outPath = args.out || 'update-manifest.json';
  writeFileSync(outPath, `${JSON.stringify(signedManifest, null, 2)}\n`);
  console.log(`Signed manifest written to: ${outPath}`);
}

main();

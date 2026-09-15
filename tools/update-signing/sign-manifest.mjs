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
//     release/Utawakui-Setup-0.4.0.exe release/Utawakui-Setup-0.4.0.exe.blockmap

import { createRequire } from 'node:module';
import { createPrivateKey, createHash, sign as signBytes } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  canonicalizeManifest,
} = require('../../electron/lib/updateManifestVerification.js');

function parseArgs(argv) {
  const args = { files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version') args.version = argv[++i];
    else if (arg === '--release-date') args.releaseDate = argv[++i];
    else if (arg === '--private-key') args.privateKeyPath = argv[++i];
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
  if (!args.version || !args.privateKeyPath || args.files.length === 0) {
    console.error(
      'Usage: sign-manifest.mjs --version <semver> --private-key <path> ' +
        '[--release-date <iso>] [--out <path>] <file...>',
    );
    process.exit(1);
  }

  const files = args.files.map((filePath) => ({
    name: path.basename(filePath),
    size: statSync(filePath).size,
    sha512: sha512Of(filePath),
  }));

  const manifest = {
    schemaVersion: 1,
    version: args.version,
    releaseDate: args.releaseDate || new Date().toISOString(),
    files,
  };

  const privateKey = createPrivateKey(readFileSync(args.privateKeyPath));
  const canonicalBytes = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  // Ed25519 does not take a digest algorithm — pass null, matching Node's
  // documented API for this key type (same reasoning as verifyManifest()).
  const signatureBuffer = signBytes(null, canonicalBytes, privateKey);

  const signedManifest = {
    ...manifest,
    signature: signatureBuffer.toString('hex'),
  };

  const outPath = args.out || 'update-manifest.json';
  writeFileSync(outPath, `${JSON.stringify(signedManifest, null, 2)}\n`);
  console.log(`Signed manifest written to: ${outPath}`);
}

main();

#!/usr/bin/env node
'use strict';

// One-off local tool: generates an Ed25519 keypair for signing
// update-manifest.json (see docs/adr/0018-signed-update-manifest.md).
// The private key never leaves this machine's disk — it is written under
// tools/update-signing/.local/, which is gitignored. The public key is
// printed so it can be pasted into shared/updateSigningPublicKey.json.
//
// This script only ever produces a `dev` keyId. Generating a `production`
// key and deciding where its private key is custodied (a separate GitHub
// Actions secret, an offline machine, etc.) is a deliberately deferred
// operational decision — see the ADR's "尚待決定" section.

import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const localDir = path.join(here, '.local');
const privateKeyPath = path.join(localDir, 'dev-private-key.pem');

if (existsSync(privateKeyPath)) {
  console.error(
    `A dev private key already exists at ${privateKeyPath}. Refusing to ` +
      'overwrite it — delete it manually first if you really want a new one ' +
      '(every manifest signed with the old key will stop verifying).',
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

mkdirSync(localDir, { recursive: true });
writeFileSync(
  privateKeyPath,
  privateKey.export({ type: 'pkcs8', format: 'pem' }),
  { mode: 0o600 },
);

const publicKeyHex = publicKey
  .export({ type: 'spki', format: 'der' })
  .toString('hex');

console.log(`Private key written to: ${privateKeyPath}`);
console.log('');
console.log('Public key (paste into shared/updateSigningPublicKey.json):');
console.log(publicKeyHex);

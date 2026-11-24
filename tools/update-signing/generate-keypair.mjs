#!/usr/bin/env node
'use strict';

// One-off local tool: generates an Ed25519 keypair for signing
// update-manifest.json (see docs/adr/0018-signed-update-manifest.md).
// The private key is written under tools/update-signing/.local/ (gitignored)
// and never printed. The registry entry for shared/updateSigningKeys.json is.
//
// Usage:
//   node tools/update-signing/generate-keypair.mjs
//   node tools/update-signing/generate-keypair.mjs --role production --label prod-2026-11
//   node tools/update-signing/generate-keypair.mjs --role recovery --label recovery-2026-11
//
// Custody (docs/operations/release-runbook.md): the production key goes to the
// protected `update-signing` GitHub environment; the recovery key goes offline
// and must not stay on this disk or on GitHub.

import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROLES = Object.freeze({
  dev: { environment: 'development', status: 'development' },
  production: { environment: 'production', status: 'active' },
  recovery: { environment: 'production', status: 'recovery' },
});
const LABEL_RE = /^[a-z0-9][a-z0-9-]{2,40}$/u;

function parseArgs(argv) {
  const args = { role: 'dev', label: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--role') args.role = argv[++i];
    else if (argv[i] === '--label') args.label = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!Object.hasOwn(ROLES, args.role)) {
    throw new Error(`--role must be one of: ${Object.keys(ROLES).join(', ')}`);
  }
  if (args.role !== 'dev' && !LABEL_RE.test(args.label ?? '')) {
    throw new Error(
      '--label is required for production keys (e.g. prod-2026-11)',
    );
  }
  return args;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const localDir = path.join(here, '.local');
const privateKeyPath = path.join(
  localDir,
  args.role === 'dev'
    ? 'dev-private-key.pem'
    : `${args.role}-${args.label}-private-key.pem`,
);

if (existsSync(privateKeyPath)) {
  console.error(
    `A private key already exists at ${privateKeyPath}. Refusing to ` +
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
  { mode: 0o600, flag: 'wx' },
);

const publicKeyHex = publicKey
  .export({ type: 'spki', format: 'der' })
  .toString('hex');
const keyId = createHash('sha256')
  .update(Buffer.from(publicKeyHex, 'hex'))
  .digest('hex');
const { environment, status } = ROLES[args.role];

console.log(`Private key written to: ${privateKeyPath}`);
console.log('');
console.log('Registry entry (add to shared/updateSigningKeys.json keys):');
console.log(
  JSON.stringify(
    {
      keyId,
      label: args.label ?? 'dev',
      environment,
      algorithm: 'ed25519',
      status,
      publicKeyHex,
    },
    null,
    2,
  ),
);

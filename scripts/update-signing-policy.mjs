#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  deriveUpdateSigningKeyId,
} = require('../electron/lib/updateManifestVerification.js');

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const ACCEPTED_STATUSES = Object.freeze({
  development: new Set(['development', 'revoked']),
  production: new Set(['active', 'retiring', 'recovery', 'revoked']),
});

export function resolveUpdateSigningPolicy({ updateValues, registry }) {
  if (
    typeof updateValues?.signedManifestEnabled !== 'boolean' ||
    registry?.schemaVersion !== 1 ||
    !Array.isArray(registry.keys) ||
    registry.keys.length > 8
  ) {
    throw new Error('Invalid update signing policy schema');
  }

  const keyIds = new Set();
  for (const key of registry.keys) {
    if (typeof key?.keyId !== 'string' || keyIds.has(key.keyId)) {
      throw new Error(
        `Duplicate or invalid update signing key id: ${key?.keyId}`,
      );
    }
    keyIds.add(key.keyId);
    if (
      key.algorithm !== 'ed25519' ||
      !['development', 'production'].includes(key.environment) ||
      !ACCEPTED_STATUSES[key.environment]?.has(key.status)
    ) {
      throw new Error(`Invalid update signing key contract: ${key.keyId}`);
    }
    let derivedKeyId;
    try {
      derivedKeyId = deriveUpdateSigningKeyId(key.publicKeyHex);
    } catch {
      throw new Error(`Invalid update signing public key: ${key.keyId}`);
    }
    if (derivedKeyId !== key.keyId) {
      throw new Error(`Update signing key fingerprint mismatch: ${key.keyId}`);
    }
  }

  if (!updateValues.signedManifestEnabled) {
    return { enabled: false, activeKeyId: '', retiringKeyId: '' };
  }

  const active = registry.keys.filter(
    (key) => key.environment === 'production' && key.status === 'active',
  );
  if (
    active.length !== 1 ||
    active[0].keyId !== registry.activeProductionKeyId
  ) {
    throw new Error(
      'Signed manifest is enabled without exactly one active production key',
    );
  }
  const retiring = registry.keys.filter(
    (key) => key.environment === 'production' && key.status === 'retiring',
  );
  if (retiring.length > 1) {
    throw new Error(
      'Signed manifest supports at most one retiring production key',
    );
  }
  return {
    enabled: true,
    activeKeyId: active[0].keyId,
    retiringKeyId: retiring[0]?.keyId || '',
  };
}

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, relativePath), 'utf8'),
  );
}

function main() {
  const policy = resolveUpdateSigningPolicy({
    updateValues: readJson('shared/appUpdateValues.json'),
    registry: readJson('shared/updateSigningKeys.json'),
  });
  if (process.argv.includes('--github-output')) {
    if (!process.env.GITHUB_OUTPUT) {
      throw new Error('GITHUB_OUTPUT is required with --github-output');
    }
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `signed_manifest_enabled=${policy.enabled}\n` +
        `active_key_id=${policy.activeKeyId}\n` +
        `retiring_key_id=${policy.retiringKeyId}\n`,
    );
    return;
  }
  process.stdout.write(`${JSON.stringify(policy)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}

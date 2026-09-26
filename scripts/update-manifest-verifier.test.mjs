import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { deriveUpdateSigningKeyId } from '../electron/lib/updateManifestVerification.js';

const temporaryDirectories = [];

function createSignedFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'utawakui-verify-'));
  temporaryDirectories.push(directory);
  const privateKeyPath = path.join(directory, 'private.pem');
  const retiringPrivateKeyPath = path.join(directory, 'retiring-private.pem');
  const artifactPath = path.join(directory, 'Utawakui-Setup-0.4.0.exe');
  const manifestPath = path.join(directory, 'update-manifest.json');
  const registryPath = path.join(directory, 'keys.json');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const { publicKey: retiringPublicKey, privateKey: retiringPrivateKey } =
    generateKeyPairSync('ed25519');
  const publicKeyHex = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('hex');
  const keyId = deriveUpdateSigningKeyId(publicKeyHex);
  const retiringPublicKeyHex = retiringPublicKey
    .export({ type: 'spki', format: 'der' })
    .toString('hex');
  const retiringKeyId = deriveUpdateSigningKeyId(retiringPublicKeyHex);
  writeFileSync(
    privateKeyPath,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  writeFileSync(
    retiringPrivateKeyPath,
    retiringPrivateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  writeFileSync(artifactPath, Buffer.from('release artifact'));
  writeFileSync(
    registryPath,
    JSON.stringify({
      schemaVersion: 1,
      activeProductionKeyId: keyId,
      keys: [
        {
          keyId,
          label: 'test-production',
          environment: 'production',
          algorithm: 'ed25519',
          status: 'active',
          publicKeyHex,
        },
        {
          keyId: retiringKeyId,
          label: 'test-retiring',
          environment: 'production',
          algorithm: 'ed25519',
          status: 'retiring',
          publicKeyHex: retiringPublicKeyHex,
        },
      ],
    }),
  );
  const signResult = spawnSync(
    process.execPath,
    [
      path.resolve(
        import.meta.dirname,
        '../tools/update-signing/sign-manifest.mjs',
      ),
      '--version',
      '0.4.0',
      '--private-key',
      privateKeyPath,
      '--private-key',
      retiringPrivateKeyPath,
      '--expected-key-id',
      keyId,
      '--out',
      manifestPath,
      artifactPath,
    ],
    { encoding: 'utf8' },
  );
  expect(signResult.status).toBe(0);
  return {
    artifactPath,
    directory,
    keyId,
    manifestPath,
    registryPath,
    retiringKeyId,
  };
}

function runVerifier(paths, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      path.resolve(
        import.meta.dirname,
        '../tools/update-signing/verify-manifest.mjs',
      ),
      '--version',
      '0.4.0',
      '--expected-key-id',
      paths.keyId,
      ...extraArgs,
      '--manifest',
      paths.manifestPath,
      '--registry',
      paths.registryPath,
      '--artifact-dir',
      paths.directory,
    ],
    { encoding: 'utf8' },
  );
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('verify-manifest', () => {
  it('verifies the signature and every declared artifact before publishing', () => {
    const paths = createSignedFixture();
    expect(
      runVerifier(paths, ['--required-key-id', paths.retiringKeyId]).status,
    ).toBe(0);

    writeFileSync(paths.artifactPath, Buffer.from('tampered artifact'));
    const tampered = runVerifier(paths);
    expect(tampered.status).not.toBe(0);
    expect(tampered.stderr).toContain('artifact does not match');
  });

  it('fails when a required overlap signature is missing', () => {
    const paths = createSignedFixture();
    const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
    manifest.signatures = manifest.signatures.filter(
      (entry) => entry.keyId !== paths.retiringKeyId,
    );
    writeFileSync(paths.manifestPath, JSON.stringify(manifest));

    const result = runVerifier(paths, [
      '--required-key-id',
      paths.retiringKeyId,
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/required production key signature/iu);
  });
});

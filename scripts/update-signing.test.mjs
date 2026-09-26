import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import updateVerification from '../electron/lib/updateManifestVerification.js';

const { deriveUpdateSigningKeyId, verifyManifest } = updateVerification;
const temporaryDirectories = [];

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'utawakui-signing-'));
  temporaryDirectories.push(directory);
  const privateKeyPath = path.join(directory, 'private.pem');
  const artifactPath = path.join(directory, 'Utawakui-Setup-0.4.0.exe');
  const manifestPath = path.join(directory, 'update-manifest.json');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(
    privateKeyPath,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  writeFileSync(artifactPath, Buffer.from('signed artifact fixture'));
  const publicKeyHex = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('hex');
  return {
    artifactPath,
    manifestPath,
    privateKeyPath,
    publicKeyHex,
    keyId: deriveUpdateSigningKeyId(publicKeyHex),
  };
}

function runSigner(fixturePaths, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      path.resolve(
        import.meta.dirname,
        '../tools/update-signing/sign-manifest.mjs',
      ),
      '--version',
      '0.4.0',
      '--release-date',
      '2026-10-01T00:00:00.000Z',
      '--private-key',
      fixturePaths.privateKeyPath,
      '--out',
      fixturePaths.manifestPath,
      ...extraArgs,
      fixturePaths.artifactPath,
    ],
    { encoding: 'utf8' },
  );
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('sign-manifest', () => {
  it('derives keyId from the private key and produces a verifiable manifest', () => {
    const paths = fixture();
    const result = runSigner(paths);

    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.signatures).toMatchObject([
      { keyId: paths.keyId, algorithm: 'ed25519' },
    ]);
    expect(manifest.files).toEqual([
      {
        name: 'Utawakui-Setup-0.4.0.exe',
        size: 23,
        sha512: createHash('sha512')
          .update(Buffer.from('signed artifact fixture'))
          .digest('hex'),
      },
    ]);
    expect(
      verifyManifest(manifest, {
        schemaVersion: 1,
        activeProductionKeyId: paths.keyId,
        keys: [
          {
            keyId: paths.keyId,
            label: 'test-production',
            environment: 'production',
            algorithm: 'ed25519',
            status: 'active',
            publicKeyHex: paths.publicKeyHex,
          },
        ],
      }),
    ).toMatchObject({ ok: true, keyId: paths.keyId });
  });

  it('emits active and retiring signatures for a rotation overlap', () => {
    const paths = fixture();
    const retiring = generateKeyPairSync('ed25519');
    const retiringPrivateKeyPath = path.join(
      path.dirname(paths.privateKeyPath),
      'retiring-private.pem',
    );
    writeFileSync(
      retiringPrivateKeyPath,
      retiring.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      { mode: 0o600 },
    );
    const retiringPublicKeyHex = retiring.publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('hex');
    const retiringKeyId = deriveUpdateSigningKeyId(retiringPublicKeyHex);

    const result = runSigner(paths, ['--private-key', retiringPrivateKeyPath]);

    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8'));
    expect(manifest.signatures.map((entry) => entry.keyId)).toEqual([
      paths.keyId,
      retiringKeyId,
    ]);
    expect(
      verifyManifest(manifest, {
        schemaVersion: 1,
        activeProductionKeyId: paths.keyId,
        keys: [
          {
            keyId: paths.keyId,
            label: 'test-active',
            environment: 'production',
            algorithm: 'ed25519',
            status: 'active',
            publicKeyHex: paths.publicKeyHex,
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
      }).verifiedKeyIds,
    ).toEqual([paths.keyId, retiringKeyId]);
  });

  it('fails before writing when the expected registry keyId does not match', () => {
    const paths = fixture();
    const result = runSigner(paths, ['--expected-key-id', '00'.repeat(32)]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('do not match');
    expect(() => readFileSync(paths.manifestPath)).toThrow();
  });
});

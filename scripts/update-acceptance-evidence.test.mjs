import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { collectUpdateAcceptanceEvidence } from './update-acceptance-evidence.mjs';
import { deriveUpdateSigningKeyId } from '../electron/lib/updateManifestVerification.js';

const temporaryDirectories = [];

function createArtifactFixture(version = '0.4.0') {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-update-acceptance-'),
  );
  temporaryDirectories.push(directory);
  const installerName = `Utawakui-Setup-${version}.exe`;
  const installer = Buffer.from('acceptance-installer-fixture');
  const blockmap = gzipSync(
    JSON.stringify({
      version: '2',
      files: [
        {
          name: 'file',
          offset: 0,
          checksums: ['fixture-checksum'],
          sizes: [installer.length],
        },
      ],
    }),
  );
  const sha512 = createHash('sha512').update(installer).digest('base64');
  const sha256 = createHash('sha256').update(installer).digest('hex');

  fs.writeFileSync(path.join(directory, installerName), installer);
  fs.writeFileSync(path.join(directory, `${installerName}.blockmap`), blockmap);
  fs.writeFileSync(
    path.join(directory, 'latest.yml'),
    [
      `version: ${version}`,
      'files:',
      `  - url: ${installerName}`,
      `    sha512: ${sha512}`,
      `    size: ${installer.length}`,
      `path: ${installerName}`,
      `sha512: ${sha512}`,
      'releaseDate: 2026-09-26T00:00:00.000Z',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(directory, 'SHA256SUMS.txt'),
    `${sha256}  ${installerName}\n`,
  );
  return { directory, installerName, installer, sha256 };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('collectUpdateAcceptanceEvidence', () => {
  it('records verified automatic evidence without claiming manual acceptance', () => {
    const fixture = createArtifactFixture();
    const evidence = collectUpdateAcceptanceEvidence({
      directory: fixture.directory,
      fromVersion: '0.3.0',
      toVersion: '0.4.0',
      generatedAt: '2026-09-26T01:02:03.000Z',
      updateValues: { signedManifestEnabled: false },
      registry: { schemaVersion: 1, activeProductionKeyId: null, keys: [] },
    });

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      generatedAt: '2026-09-26T01:02:03.000Z',
      upgradePath: { fromVersion: '0.3.0', toVersion: '0.4.0' },
      contracts: {
        releaseBundle: 'verified',
        installerSha256: 'verified',
        signedManifest: 'disabled',
      },
      signing: {
        enabled: false,
        activeKeyId: null,
        retiringKeyId: null,
      },
      manual: {
        authenticodeStatus: 'pending',
        manualInstallerParity: 'pending',
        productionFeedUpdate: 'pending',
        dataRetention: 'pending',
        rollbackRecovery: 'pending',
      },
    });
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: fixture.installerName,
          size: fixture.installer.length,
          sha256: fixture.sha256,
        }),
      ]),
    );
  });

  it('rejects a checksum that does not bind the installer', () => {
    const fixture = createArtifactFixture();
    fs.writeFileSync(
      path.join(fixture.directory, 'SHA256SUMS.txt'),
      `${'0'.repeat(64)}  ${fixture.installerName}\n`,
    );

    expect(() =>
      collectUpdateAcceptanceEvidence({
        directory: fixture.directory,
        fromVersion: '0.3.0',
        toVersion: '0.4.0',
        updateValues: { signedManifestEnabled: false },
        registry: { schemaVersion: 1, activeProductionKeyId: null, keys: [] },
      }),
    ).toThrow(/SHA256SUMS/iu);
  });

  it('requires a signed manifest whenever the production gate is enabled', () => {
    const fixture = createArtifactFixture();
    expect(() =>
      collectUpdateAcceptanceEvidence({
        directory: fixture.directory,
        fromVersion: '0.3.0',
        toVersion: '0.4.0',
        updateValues: { signedManifestEnabled: true },
        registry: {
          schemaVersion: 1,
          activeProductionKeyId: 'missing',
          keys: [],
        },
      }),
    ).toThrow();
  });

  it('verifies the production manifest when the gate is enabled', () => {
    const fixture = createArtifactFixture();
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyHex = publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('hex');
    const keyId = deriveUpdateSigningKeyId(publicKeyHex);
    const privateKeyPath = path.join(fixture.directory, 'private.pem');
    const registry = {
      schemaVersion: 1,
      activeProductionKeyId: keyId,
      keys: [
        {
          keyId,
          label: 'acceptance-test',
          environment: 'production',
          algorithm: 'ed25519',
          status: 'active',
          publicKeyHex,
        },
      ],
    };
    fs.writeFileSync(
      privateKeyPath,
      privateKey.export({ type: 'pkcs8', format: 'pem' }),
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
        '--expected-key-id',
        keyId,
        '--out',
        path.join(fixture.directory, 'update-manifest.json'),
        path.join(fixture.directory, fixture.installerName),
      ],
      { encoding: 'utf8' },
    );
    expect(signResult.status).toBe(0);

    const evidence = collectUpdateAcceptanceEvidence({
      directory: fixture.directory,
      fromVersion: '0.3.0',
      toVersion: '0.4.0',
      updateValues: { signedManifestEnabled: true },
      registry,
    });
    expect(evidence.contracts.signedManifest).toBe('verified');
    expect(evidence.signing.activeKeyId).toBe(keyId);
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'update-manifest.json' }),
      ]),
    );
  });
});

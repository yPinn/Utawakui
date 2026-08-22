import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import {
  verifyArtifactContract,
  verifyReleaseNotes,
  verifyVersionContract,
} from './release-contract.mjs';

const temporaryDirectories = [];

function createTemporaryDirectory() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-release-contract-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function createVersionFiles(version = '0.2.0') {
  return {
    packageJson: { version },
    packageLock: {
      version,
      packages: { '': { version } },
    },
  };
}

function createArtifactFixture(version = '0.2.0') {
  const directory = createTemporaryDirectory();
  const installerName = `Utawakui-Setup-${version}.exe`;
  const installer = Buffer.from('signed-installer-fixture');
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
      'releaseDate: 2026-08-22T00:00:00.000Z',
      '',
    ].join('\n'),
  );

  return { blockmap, directory, installer, installerName };
}

function mutateMetadata(fixture, mutate) {
  const metadataPath = path.join(fixture.directory, 'latest.yml');
  const metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
  mutate(metadata);
  fs.writeFileSync(metadataPath, yaml.dump(metadata));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('verifyVersionContract', () => {
  it('accepts an exact stable tag and matching package versions', () => {
    const files = createVersionFiles();

    expect(verifyVersionContract({ tag: 'v0.2.0', ...files })).toBe('0.2.0');
  });

  it.each([
    ['v0.2.0-beta.1', createVersionFiles()],
    ['release-0.2.0', createVersionFiles()],
    ['v0.2.1', createVersionFiles()],
    [
      'v0.2.0',
      {
        packageJson: { version: '0.2.0' },
        packageLock: {
          version: '0.2.1',
          packages: { '': { version: '0.2.0' } },
        },
      },
    ],
  ])('rejects an invalid release contract for %s', (tag, files) => {
    expect(() => verifyVersionContract({ tag, ...files })).toThrow();
  });
});

describe('verifyReleaseNotes', () => {
  it('requires non-empty release notes', () => {
    const directory = createTemporaryDirectory();
    const notesPath = path.join(directory, 'v0.2.0.md');
    fs.writeFileSync(notesPath, '# Utawakui 0.2.0\n\nRelease notes.\n');

    expect(verifyReleaseNotes(notesPath)).toBe(notesPath);
    expect(() =>
      verifyReleaseNotes(path.join(directory, 'missing.md')),
    ).toThrow();

    fs.writeFileSync(notesPath, '  \n');
    expect(() => verifyReleaseNotes(notesPath)).toThrow();
  });
});

describe('verifyArtifactContract', () => {
  it('accepts matching installer, blockmap, and update metadata', () => {
    const fixture = createArtifactFixture();

    expect(
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toMatchObject({
      installerName: fixture.installerName,
      installerSize: fixture.installer.length,
      blockmapSize: fixture.blockmap.length,
    });
  });

  it('rejects metadata that does not match the installer hash', () => {
    const fixture = createArtifactFixture();
    const metadataPath = path.join(fixture.directory, 'latest.yml');
    const metadata = fs
      .readFileSync(metadataPath, 'utf8')
      .replace(/sha512: .+/g, 'sha512: invalid');
    fs.writeFileSync(metadataPath, metadata);

    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toThrow(/SHA-512/);
  });

  it.each([
    ['version', (metadata) => (metadata.version = '0.3.0'), /version/i],
    ['path', (metadata) => (metadata.path = 'other.exe'), /path/i],
    ['files', (metadata) => delete metadata.files, /files/i],
    [
      'installer entry',
      (metadata) => (metadata.files[0].url = 'other.exe'),
      /installer entry/i,
    ],
    [
      'installer size',
      (metadata) => (metadata.files[0].size += 1),
      /installer size/i,
    ],
    [
      'top-level SHA-512',
      (metadata) => (metadata.sha512 = 'invalid'),
      /top-level SHA-512/i,
    ],
  ])('rejects a latest.yml %s mismatch', (_label, mutate, error) => {
    const fixture = createArtifactFixture();
    mutateMetadata(fixture, mutate);

    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toThrow(error);
  });

  it('checks an optional latest.yml blockmap size', () => {
    const fixture = createArtifactFixture();
    mutateMetadata(
      fixture,
      (metadata) => (metadata.files[0].blockMapSize = fixture.blockmap.length),
    );

    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).not.toThrow();

    mutateMetadata(
      fixture,
      (metadata) => (metadata.files[0].blockMapSize += 1),
    );
    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toThrow(/blockmap size/i);
  });

  it('rejects a blockmap that does not cover the installer', () => {
    const fixture = createArtifactFixture();
    const blockmapPath = path.join(
      fixture.directory,
      `${fixture.installerName}.blockmap`,
    );
    const blockmap = JSON.parse(
      gunzipSync(fs.readFileSync(blockmapPath)).toString(),
    );
    blockmap.files[0].sizes[0] -= 1;
    fs.writeFileSync(blockmapPath, gzipSync(JSON.stringify(blockmap)));

    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toThrow(/cover the installer size/i);
  });

  it('rejects malformed or non-object update metadata', () => {
    const fixture = createArtifactFixture();
    const metadataPath = path.join(fixture.directory, 'latest.yml');

    fs.writeFileSync(metadataPath, 'files: [unterminated');
    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toThrow(/Invalid latest.yml/);

    fs.writeFileSync(metadataPath, '- item\n');
    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toThrow(/contain an object/);
  });

  it('rejects a missing blockmap', () => {
    const fixture = createArtifactFixture();
    fs.rmSync(
      path.join(fixture.directory, `${fixture.installerName}.blockmap`),
    );

    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toThrow(/blockmap/i);
  });

  it('rejects an empty blockmap and an invalid artifact version', () => {
    const fixture = createArtifactFixture();
    fs.writeFileSync(
      path.join(fixture.directory, `${fixture.installerName}.blockmap`),
      '',
    );

    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: '0.2.0',
      }),
    ).toThrow(/non-empty/);
    expect(() =>
      verifyArtifactContract({
        directory: fixture.directory,
        version: 'not-a-version',
      }),
    ).toThrow(/version is invalid/);
  });
});

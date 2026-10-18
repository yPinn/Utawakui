import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectThirdPartyNotices,
  verifyThirdPartyNotices,
  writeThirdPartyNotices,
  verifyPackagedThirdPartyNotices,
} from './third-party-notices.mjs';

const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-notices-'));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, 'third-party'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      packages: {
        '': { dependencies: { demo: '1.0.0' } },
        'node_modules/demo': { version: '1.0.0', license: 'MIT' },
      },
    }),
  );
  fs.writeFileSync(
    path.join(root, 'node_modules/demo/package.json'),
    JSON.stringify({ name: 'demo', version: '1.0.0', license: 'MIT' }),
  );
  fs.writeFileSync(
    path.join(root, 'node_modules/demo/LICENSE'),
    'Copyright Demo Author\nPermission is hereby granted: full fixture terms.\n',
  );
  fs.writeFileSync(
    path.join(root, 'third-party/reviewed-sources.json'),
    JSON.stringify({ schemaVersion: 1, packages: [], additional: [] }),
  );
  return root;
}

const options = { browserRoots: [] };

describe('complete packaged third-party notices', () => {
  it('includes full texts and attribution and detects tampering and stale versions', () => {
    const root = fixture();
    writeThirdPartyNotices(root, options);
    expect(verifyThirdPartyNotices(root, options).packages).toHaveLength(1);
    expect(
      fs.readFileSync(path.join(root, 'third-party/NOTICES.txt'), 'utf8'),
    ).toContain('Copyright Demo Author');
    fs.appendFileSync(path.join(root, 'third-party/NOTICES.txt'), 'tampered');
    expect(() => verifyThirdPartyNotices(root, options)).toThrow(
      /stale|changed/u,
    );
    writeThirdPartyNotices(root, options);
    const lockPath = path.join(root, 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.packages['node_modules/demo'].version = '2.0.0';
    fs.writeFileSync(lockPath, JSON.stringify(lock));
    expect(() => verifyThirdPartyNotices(root, options)).toThrow(/version/u);
  });

  it('fails when a shipped dependency has no full text instead of accepting SPDX alone', () => {
    const root = fixture();
    fs.unlinkSync(path.join(root, 'node_modules/demo/LICENSE'));
    expect(() => collectThirdPartyNotices(root, options)).toThrow(
      /full.*notice/u,
    );
  });

  it('rejects changed reviewed upstream files and unreviewed package upgrades', () => {
    const root = fixture();
    const policyPath = path.join(root, 'third-party/reviewed-sources.json');
    const policy = {
      schemaVersion: 1,
      packages: [
        {
          path: 'node_modules/demo',
          version: '0.9.0',
          files: [],
        },
      ],
      additional: [],
    };
    fs.writeFileSync(policyPath, JSON.stringify(policy));
    expect(() => collectThirdPartyNotices(root, options)).toThrow(
      /reviewed version/u,
    );
    policy.packages[0].version = '1.0.0';
    policy.packages[0].files = [
      {
        path: 'upstream.txt',
        sha256: '0'.repeat(64),
        source: 'https://example.test/LICENSE',
      },
    ];
    fs.writeFileSync(path.join(root, 'third-party/upstream.txt'), 'changed');
    fs.writeFileSync(policyPath, JSON.stringify(policy));
    expect(() => collectThirdPartyNotices(root, options)).toThrow(/checksum/u);
  });

  it('verifies delivered notices independently and rejects missing or altered packaged texts', async () => {
    const root = fixture();
    writeThirdPartyNotices(root, options);
    const output = path.join(root, 'win-unpacked');
    const resources = path.join(output, 'resources');
    fs.mkdirSync(path.join(resources, 'third-party'), { recursive: true });
    for (const name of ['manifest.json', 'NOTICES.txt']) {
      fs.copyFileSync(
        path.join(root, 'third-party', name),
        path.join(resources, 'third-party', name),
      );
    }
    const { createPackage } = await import('@electron/asar');
    const source = path.join(root, 'app');
    fs.mkdirSync(source);
    fs.cpSync(
      path.join(root, 'node_modules'),
      path.join(source, 'node_modules'),
      { recursive: true },
    );
    await createPackage(source, path.join(resources, 'app.asar'));
    expect(
      verifyPackagedThirdPartyNotices(root, output, options).packages,
    ).toHaveLength(1);
    fs.writeFileSync(
      path.join(resources, 'third-party/NOTICES.txt'),
      'summary only',
    );
    expect(() =>
      verifyPackagedThirdPartyNotices(root, output, options),
    ).toThrow(/packaged.*NOTICES/u);
  });

  it.each(['1.0.0', '2.0.0'])(
    'handles builder relocation while rejecting an unreviewed delivered version %s',
    async (version) => {
      const root = fixture();
      writeThirdPartyNotices(root, options);
      const output = path.join(root, 'win-unpacked');
      const resources = path.join(output, 'resources');
      fs.mkdirSync(path.join(resources, 'third-party'), { recursive: true });
      for (const name of ['manifest.json', 'NOTICES.txt']) {
        fs.copyFileSync(
          path.join(root, 'third-party', name),
          path.join(resources, 'third-party', name),
        );
      }
      const source = path.join(root, 'app');
      const relocated = path.join(
        source,
        'node_modules/parent/node_modules/demo',
      );
      fs.mkdirSync(relocated, { recursive: true });
      fs.writeFileSync(
        path.join(relocated, 'package.json'),
        JSON.stringify({ name: 'demo', version }),
      );
      const { createPackage } = await import('@electron/asar');
      await createPackage(source, path.join(resources, 'app.asar'));
      if (version === '1.0.0') {
        expect(
          verifyPackagedThirdPartyNotices(root, output, options).packages,
        ).toHaveLength(1);
      } else {
        expect(() =>
          verifyPackagedThirdPartyNotices(root, output, options),
        ).toThrow(/Uncovered packaged dependency version/u);
      }
    },
  );
});

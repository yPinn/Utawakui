import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const packageLock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
);

describe('release dependency security contract', () => {
  it('uses the patched ONNX Runtime archive dependency line', () => {
    expect(packageJson.dependencies['onnxruntime-node']).toBe('^1.30.0');
    expect(packageJson.devDependencies['adm-zip']).toBe('0.6.1');

    const admZipEntries = Object.entries(packageLock.packages).filter(
      ([path]) => path.endsWith('node_modules/adm-zip'),
    );
    expect(admZipEntries).not.toHaveLength(0);
    expect(
      admZipEntries.every(([, metadata]) => metadata.version === '0.6.1'),
    ).toBe(true);
  });

  it('uses the patched Vitest 4 line without a major-version migration', () => {
    expect(packageJson.devDependencies.vitest).toBe('^4.1.11');
    expect(packageJson.devDependencies['@vitest/coverage-v8']).toBe('^4.1.11');
    expect(packageJson.devDependencies['@vitest/coverage-istanbul']).toBe(
      '^4.1.11',
    );
  });

  it('overrides markdownlint-cli2 to a patched smol-toml release', () => {
    expect(packageJson.overrides?.['smol-toml']).toBe('1.8.0');
    expect(packageLock.packages['node_modules/smol-toml'].version).toBe(
      '1.8.0',
    );
  });
});

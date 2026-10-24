import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { satisfies } from 'semver';

import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const packageLock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
);
const require = createRequire(import.meta.url);
const mathRequire = createRequire(require.resolve('micromark-extension-math'));
const katex = mathRequire('katex');

describe('release dependency security contract', () => {
  it('locks the Markdown math renderer above the KaTeX trust advisory floor', () => {
    expect(packageJson.overrides?.['micromark-extension-math']?.katex).toBe(
      '0.18.2',
    );
    const entries = Object.entries(packageLock.packages).filter(
      ([packagePath]) => packagePath.endsWith('node_modules/katex'),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const [packagePath, metadata] of entries) {
      expect(satisfies(metadata.version, '>=0.18.2 <0.19'), packagePath).toBe(
        true,
      );
    }
  });

  it('does not inherit trusted rendering from an options prototype', () => {
    const formula = String.raw`\href{https://example.test}{x}`;
    const options = Object.assign(Object.create({ trust: true }), {
      throwOnError: false,
      strict: 'ignore',
    });
    expect(katex.renderToString(formula, options)).not.toContain(
      'href="https://example.test"',
    );
    expect(katex.renderToString(formula, { trust: true })).toContain(
      'href="https://example.test"',
    );
  });

  it('keeps inline and block Markdown math rendering compatible', async () => {
    const { micromark } = await import('micromark');
    const { math, mathHtml } = await import('micromark-extension-math');
    const html = micromark('$x^2$\n\n$$\ny=1\n$$\n', {
      extensions: [math()],
      htmlExtensions: [mathHtml()],
    });
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
  });

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
    expect(packageJson.devDependencies.vitest).toBe('^4.1.12');
    expect(packageJson.devDependencies['@vitest/coverage-v8']).toBe('^4.1.12');
    expect(packageJson.devDependencies['@vitest/coverage-istanbul']).toBe(
      '^4.1.12',
    );
  });

  it('overrides markdownlint-cli2 to a patched smol-toml release', () => {
    expect(packageJson.overrides?.['smol-toml']).toBe('1.9.0');
    expect(packageLock.packages['node_modules/smol-toml'].version).toBe(
      '1.9.0',
    );
  });
});

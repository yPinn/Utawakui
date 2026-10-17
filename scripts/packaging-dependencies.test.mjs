import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));
const packageJson = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const builder = yaml.load(
  readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'),
);
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  'electron',
  'original-fs',
]);

// Packaged main, worker and shared runtime code (electron-builder `files`).
const runtimeSources = execFileSync(
  'git',
  ['ls-files', 'electron', 'shared', 'overlay'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\n')
  .filter((file) => /\.(c?js|mjs)$/u.test(file) && !/\.test\./u.test(file))
  .map((file) => ({
    file,
    // Whole-line comments only; block-comment stripping would cut globs in strings.
    source: readFileSync(path.join(root, file), 'utf8').replace(
      /^\s*(?:\/\/|\*|\/\*).*$/gmu,
      '',
    ),
  }));

const SPECIFIER_PATTERNS = [
  /\brequire(?:\.resolve)?\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /^\s*(?:import|export)\b[^'"\n]*?\bfrom\s*['"]([^'"]+)['"]/gmu,
  /^\s*\}\s*from\s*['"]([^'"]+)['"]/gmu,
  /^\s*import\s*['"]([^'"]+)['"]/gmu,
];

function bareSpecifiers() {
  const uses = [];
  for (const { file, source } of runtimeSources) {
    for (const pattern of SPECIFIER_PATTERNS) {
      for (const [, specifier] of source.matchAll(pattern)) {
        if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
        if (builtins.has(specifier) || builtins.has(specifier.split('/')[0])) {
          continue;
        }
        const name = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0];
        uses.push({ file, specifier, name });
      }
    }
  }
  return uses;
}

const dependencies = new Set(Object.keys(packageJson.dependencies));

describe('packaged dependency boundary', () => {
  it('declares every package the packaged runtime loads as a dependency', () => {
    const undeclared = bareSpecifiers()
      .filter(({ name }) => !dependencies.has(name))
      .map(({ file, specifier }) => `${file} -> ${specifier}`);

    expect(runtimeSources.length).toBeGreaterThan(100);
    expect(undeclared).toEqual([]);
  });

  it('keeps no production dependency the packaged runtime never loads', () => {
    const used = new Set(bareSpecifiers().map(({ name }) => name));

    expect([...dependencies].filter((name) => !used.has(name))).toEqual([]);
  });

  it('never trims a file the packaged runtime resolves', () => {
    const exclusions = builder.files
      .filter((pattern) => pattern.startsWith('!node_modules/'))
      .map((pattern) => pattern.slice(1));
    const inclusions = builder.files.filter((pattern) =>
      pattern.startsWith('node_modules/'),
    );
    const trimmed = bareSpecifiers()
      .map(({ file, specifier }) => {
        const resolved = path
          .relative(root, require.resolve(specifier))
          .split(path.sep)
          .join('/');
        return { file, specifier, resolved };
      })
      .filter(
        ({ resolved }) =>
          exclusions.some((glob) => path.matchesGlob(resolved, glob)) &&
          !inclusions.some((glob) => path.matchesGlob(resolved, glob)),
      )
      .map(
        ({ file, specifier, resolved }) =>
          `${file} -> ${specifier} (${resolved})`,
      );

    expect(exclusions.length).toBeGreaterThan(0);
    expect(trimmed).toEqual([]);
  });
});

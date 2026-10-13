import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const vueSources = [
  resolve(root, 'src/App.vue'),
  ...filesUnder(resolve(root, 'src/components')),
  ...filesUnder(resolve(root, 'src/views')),
]
  .filter((path) => path.endsWith('.vue'))
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

const uiPrimitiveSources = vueSources.filter(({ path }) =>
  path.includes(resolve(root, 'src/components/ui')),
);
const featureAndPageSources = vueSources.filter(
  ({ path }) =>
    !path.includes(resolve(root, 'src/components/ui')) &&
    !path.includes(resolve(root, 'src/components/demo')),
);

const semanticRecipes = {
  heading: [
    'font-size: var(--ui-font-size-xl);',
    'font-weight: var(--ui-font-weight-bold);',
    'line-height: var(--ui-line-height-heading);',
  ],
  title: [
    'font-size: var(--ui-font-size-lg);',
    'font-weight: var(--ui-font-weight-semibold);',
    'line-height: var(--ui-line-height-title);',
  ],
  body: [
    'font-size: var(--ui-font-size-md);',
    'font-weight: var(--ui-font-weight-regular);',
    'line-height: var(--ui-line-height-body);',
  ],
  'body-compact': [
    'font-size: var(--ui-font-size-sm);',
    'font-weight: var(--ui-font-weight-regular);',
    'line-height: var(--ui-line-height-label);',
  ],
  label: [
    'font-size: var(--ui-font-size-sm);',
    'font-weight: var(--ui-font-weight-semibold);',
    'line-height: var(--ui-line-height-label);',
  ],
  caption: [
    'font-size: var(--ui-font-size-sm);',
    'font-weight: var(--ui-font-weight-regular);',
    'line-height: var(--ui-line-height-caption);',
  ],
};

function declarationBlocks(source) {
  return [...source.matchAll(/\{([^{}]*)\}/gu)].map((match) => ({
    body: match[1],
    line: source.slice(0, match.index).split('\n').length,
  }));
}

describe('semantic typography adoption', () => {
  it('does not rebuild a complete semantic type recipe from foundation tokens', () => {
    const rebuiltRecipes = vueSources.flatMap(({ path, source }) =>
      declarationBlocks(source).flatMap(({ body, line }) =>
        Object.entries(semanticRecipes)
          .filter(([, declarations]) =>
            declarations.every((declaration) => body.includes(declaration)),
          )
          .map(
            ([role]) =>
              `${relative(root, path).replaceAll('\\', '/')}:${line} -> ${role}`,
          ),
      ),
    );

    expect(rebuiltRecipes).toEqual([]);
  });

  it('keeps foundation typography out of shared primitives except bounded emphasis states', () => {
    const allowedByFile = new Map([
      ['src/components/ui/UiFolderArtifact.vue', ['--ui-font-weight-bold']],
      ['src/components/ui/UiSegmentedControl.vue', ['--ui-font-weight-bold']],
    ]);
    const directFoundationUsage = uiPrimitiveSources.flatMap(
      ({ path, source }) => {
        const projectPath = relative(root, path).replaceAll('\\', '/');
        const allowed = allowedByFile.get(projectPath) ?? [];
        return [
          ...source.matchAll(
            /--ui-(?:font-size|font-weight|line-height)-[\w-]+/gu,
          ),
        ]
          .map(([token]) => token)
          .filter((token) => !allowed.includes(token))
          .map((token) => `${projectPath} -> ${token}`);
      },
    );

    expect(directFoundationUsage).toEqual([]);
  });

  it('does not assemble feature or page text from multiple foundation type axes', () => {
    const rebuiltPairs = featureAndPageSources.flatMap(({ path, source }) =>
      declarationBlocks(source).flatMap(({ body, line }) => {
        const foundationAxes = [
          /--ui-font-size-[\w-]+/u,
          /--ui-font-weight-[\w-]+/u,
          /--ui-line-height-[\w-]+/u,
        ].filter((pattern) => pattern.test(body));
        return foundationAxes.length >= 2
          ? [`${relative(root, path).replaceAll('\\', '/')}:${line}`]
          : [];
      }),
    );

    expect(rebuiltPairs).toEqual([]);
  });
});

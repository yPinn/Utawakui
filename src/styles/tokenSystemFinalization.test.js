import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_SURFACE_REGISTRY } from '../utils/rendererSurfaceRegistry.js';

const root = resolve(import.meta.dirname, '../..');
const readSource = (projectPath) =>
  readFileSync(resolve(root, projectPath), 'utf8');

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const retiredPaths = [
  'scripts/token-v2-migration-inventory.mjs',
  'scripts/token-v2-migration-inventory.test.mjs',
  'scripts/token-v2-scope-readiness.mjs',
  'scripts/token-v2-scope-readiness.test.mjs',
  'src/styles/token-v1-invalidation.generated.css',
  'src/styles/token-v1-legacy-manifest.generated.json',
  'src/styles/tokens-v2.css',
];

describe('finalized control-panel token system', () => {
  it('ships one stable token entry with the adopted v2 graph', () => {
    const tokens = readSource('src/styles/tokens.css');
    const names = new Set(
      [...tokens.matchAll(/(^|\n)\s*(--ui-[\w-]+)\s*:/gu)].map(
        ([, , name]) => name,
      ),
    );

    expect(names.size).toBe(483);
    expect(names).toContain('--ui-folder-content-background');
    expect(names).toContain('--ui-folder-content-state-min-block-size');
    expect(names).toContain('--ui-folder-sheet-background');
    expect(names).toContain('--ui-folder-sheet-frame-block-end-gap');
    expect(names).toContain('--ui-folder-sheet-binding-gutter');
    expect(names).toContain('--ui-folder-sheet-hole-size');
    expect(names).toContain('--ui-folder-sheet-hole-edge-inset');
    expect(names).toContain('--ui-folder-sheet-hole-rail-block-size');
    expect(names).toContain('--ui-folder-sheet-binding-field-max-block-size');
    expect(names).not.toContain('--ui-folder-sheet-hole-rail-offset');
    expect(names).toContain('--ui-folder-sheet-scrollbar-gap');
    expect(names).toContain('--ui-folder-sheet-min-block-size');
    expect(names).toContain('--ui-folder-sheet-max-inline-size');
    expect(names).toContain('--ui-folder-artifact-pinned-region-inset');
    expect(names).toContain('--ui-folder-extension-block-inset');
    expect(names).toContain('--ui-folder-artifact-folder-min-height');
    expect([...names]).not.toEqual(
      expect.arrayContaining([
        '--ui-folder-interior-background-setlist',
        '--ui-folder-interior-background-lyrics',
        '--ui-folder-interior-background-output',
        '--ui-folder-interior-background-import',
      ]),
    );
    for (const role of ['primary', 'secondary', 'tertiary', 'neutral']) {
      expect(names).toContain(`--ui-color-folder-${role}-foreground`);
    }
    expect(names).toContain('--ui-right-dock-section-surface-background');
    expect(names).toContain('--ui-right-dock-section-surface-padding');
    expect(names).toContain('--ui-right-dock-section-surface-radius');
    expect(tokens).toContain(
      "[data-ui-system='v2'][data-ui-surface-root='true'] {",
    );
    expect(tokens).not.toContain("[data-ui-system='v1']");
    for (const path of retiredPaths) {
      expect(existsSync(resolve(root, path)), path).toBe(false);
    }
  });

  it('loads the stable entry once in every renderer and isolated prototype', () => {
    const entryContracts = [
      ['src/main.js', "import './styles/tokens.css';"],
      ['src/performer-main.js', "import './styles/tokens.css';"],
      [
        'prototypes/ui-component-lab/src/main.js',
        "import '../../../src/styles/tokens.css';",
      ],
      [
        'prototypes/studio-library-workspace/index.html',
        'href="../../src/styles/tokens.css"',
      ],
    ];

    for (const [path, expectedEntry] of entryContracts) {
      const source = readSource(path);
      expect(source, path).toContain(expectedEntry);
      expect(source, path).not.toContain('tokens-v2.css');
      expect(source, path).not.toContain('token-v1-invalidation');
    }
  });

  it('keeps the registry as stable ownership data instead of migration state', () => {
    const registrySource = readSource('src/utils/rendererSurfaceRegistry.js');

    expect(registrySource).not.toContain('migrationStatus');
    expect(registrySource).not.toContain('registered-v1');
    expect(registrySource).not.toContain('registered-v2');
    expect(Object.values(UI_SURFACE_REGISTRY)).not.toHaveLength(0);
    for (const definition of Object.values(UI_SURFACE_REGISTRY)) {
      expect(definition.system, definition.surfaceId).toBe('v2');
      expect(definition).not.toHaveProperty('migrationStatus');
    }
  });

  it('keeps v2 research specimens visible but outside the production graph', () => {
    const candidateFiles = readdirSync(resolve(root, 'src/components/demo'), {
      withFileTypes: true,
    })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith('DemoCandidate') &&
          entry.name.endsWith('.vue'),
      )
      .map((entry) => entry.name)
      .toSorted();
    const productionCandidateReferences = filesUnder(resolve(root, 'src'))
      .filter((path) => /\.(?:js|vue)$/u.test(path))
      .filter((path) => !/\.(?:test|spec)\.[^.]+$/u.test(path))
      .filter((path) => !path.includes(resolve(root, 'src/components/demo')))
      .filter((path) => readFileSync(path, 'utf8').includes('DemoCandidate'));

    expect(candidateFiles).toHaveLength(17);
    expect(productionCandidateReferences).toEqual([]);
    expect(readSource('src/views/VisualSystemView.vue')).toContain(
      '<DemoView />',
    );
  });

  it('removes migration-only package commands', () => {
    const packageJson = JSON.parse(readSource('package.json'));

    expect(packageJson.scripts).not.toHaveProperty('tokens:v2:check');
    expect(packageJson.scripts).not.toHaveProperty('tokens:v2:generate');
  });

  it('keeps every production token reference declared without legacy runtime syntax', () => {
    const productionSources = filesUnder(resolve(root, 'src'))
      .filter((path) => /\.(?:css|js|vue)$/u.test(path))
      .filter((path) => !/\.(?:test|spec)\.[^.]+$/u.test(path))
      .filter((path) => !path.includes(resolve(root, 'src/components/demo')))
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }));
    const declaredNames = new Set(
      productionSources.flatMap(({ source }) =>
        [...source.matchAll(/['"]?(--ui-[\w-]+)['"]?\s*:/gu)].map(
          ([, name]) => name,
        ),
      ),
    );
    const styleSources = productionSources.filter(({ path }) =>
      /\.(?:css|vue)$/u.test(path),
    );
    const unresolvedReferences = styleSources.flatMap(({ path, source }) =>
      [...source.matchAll(/var\(\s*(--ui-[\w-]+)/gu)]
        .map(([, name]) => name)
        .filter((name) => !declaredNames.has(name))
        .map((name) => `${path.slice(root.length + 1)}: ${name}`),
    );
    const forbiddenRuntimeSyntax = styleSources.flatMap(({ path, source }) =>
      [
        "data-ui-system='v1'",
        'tokens-v2.css',
        'token-v1-',
        'registered-v1',
        'registered-v2',
      ]
        .filter((syntax) => source.includes(syntax))
        .map((syntax) => `${path.slice(root.length + 1)}: ${syntax}`),
    );

    expect(unresolvedReferences).toEqual([]);
    expect(forbiddenRuntimeSyntax).toEqual([]);
  });
});

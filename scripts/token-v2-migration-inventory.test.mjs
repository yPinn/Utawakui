import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTokenV2MigrationInventory,
  generatedArtifactPaths,
  renderLegacyInvalidationCss,
  runTokenV2MigrationInventoryCli,
  serializeMigrationManifest,
} from './token-v2-migration-inventory.mjs';

const root = resolve(import.meta.dirname, '..');
const inventory = buildTokenV2MigrationInventory({ root });
const artifactPaths = generatedArtifactPaths(root);

describe('Token v2 migration inventory', () => {
  it('builds a deterministic canonical legacy manifest', () => {
    expect(inventory.schemaVersion).toBe(1);
    expect(inventory.declarations).toEqual({
      v1: 413,
      v2: 372,
      v1Only: 169,
    });
    expect(inventory.production).toMatchObject({
      files: 74,
      tokens: 149,
      pairs: 273,
    });
    expect(inventory.legacyTokens).toHaveLength(169);
    expect(inventory.legacyTokens).toEqual(
      [...inventory.legacyTokens].toSorted(),
    );
    expect(inventory.production.references).toEqual(
      [...inventory.production.references].toSorted((left, right) => {
        const leftKey = `${left.surface}\0${left.file}\0${left.token}`;
        const rightKey = `${right.surface}\0${right.file}\0${right.token}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
    );
    expect(JSON.stringify(inventory)).not.toContain(root);
  });

  it('pins the complete atomic scope activation set without changing runtime', () => {
    expect(inventory.activation.rootBoundRecipes).toEqual([
      { file: 'src/components/layout/AppTopTabs.vue', occurrences: 4 },
      { file: 'src/components/ui/UiButton.vue', occurrences: 8 },
      { file: 'src/components/ui/UiIconButton.vue', occurrences: 4 },
      { file: 'src/components/ui/UiRange.vue', occurrences: 6 },
      { file: 'src/components/ui/UiTextButton.vue', occurrences: 2 },
      {
        file: 'src/components/ui/range/UiRangeControl.vue',
        occurrences: 26,
      },
    ]);
    expect(inventory.activation.rootBoundRecipeOccurrences).toBe(50);
    expect(inventory.activation.crossVersionFeatureTokens).toHaveLength(72);
    expect(inventory.activation.teleports).toMatchObject({
      demoCount: 2,
      productionCount: 6,
    });
    expect(inventory.activation.documentSystemWriters).toHaveLength(4);
    expect(inventory.activation.documentSpecimenMarkers).toHaveLength(2);
    expect(inventory.activation.prototypeDocumentRoots).toHaveLength(2);
    expect(inventory.activation.baseVisualTokenReferences).toHaveLength(8);
    expect(inventory.activation.reviewComposable).toMatchObject({
      current: 'src/composables/useVisualSystemMode.js',
      target: 'src/composables/useVisualReviewMode.js',
    });
  });

  it('keeps checked-in generated artifacts byte-for-byte reproducible', () => {
    expect(readFileSync(artifactPaths.manifest, 'utf8')).toBe(
      serializeMigrationManifest(inventory),
    );
    expect(readFileSync(artifactPaths.invalidation, 'utf8')).toBe(
      renderLegacyInvalidationCss(inventory.legacyTokens),
    );
  });

  it('generates a guaranteed-invalid override for every T1-only name', () => {
    const css = renderLegacyInvalidationCss(inventory.legacyTokens);

    expect(css).toContain("[data-ui-system='v2'] {");
    expect(css.match(/^ {2}--ui-[\w-]+: initial;$/gmu)).toHaveLength(169);
    for (const token of inventory.legacyTokens) {
      expect(css).toContain(`  ${token}: initial;`);
    }
  });

  it('checks generated artifacts without mutating them', () => {
    let output = '';

    const summary = runTokenV2MigrationInventoryCli({
      argv: ['--check'],
      root,
      stdout: { write: (value) => (output += value) },
    });

    expect(summary).toEqual({
      declarations: { v1: 413, v1Only: 169, v2: 372 },
      mode: 'check',
      production: { files: 74, pairs: 273, tokens: 149 },
    });
    expect(JSON.parse(output)).toEqual(summary);
  });

  it('rejects unsupported generator arguments', () => {
    expect(() =>
      runTokenV2MigrationInventoryCli({
        argv: ['--print'],
        root,
        stdout: { write: () => {} },
      }),
    ).toThrow(
      'Usage: node scripts/token-v2-migration-inventory.mjs [--check|--write]',
    );
  });
});

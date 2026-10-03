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
      v1: 292,
      v2: 407,
      v1Only: 48,
    });
    expect(inventory.production).toMatchObject({
      files: 0,
      tokens: 0,
      pairs: 0,
    });
    expect(inventory.legacyTokens).toHaveLength(48);
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

  it('pins the completed atomic scope activation set', () => {
    expect(inventory.activation.rootBoundRecipes).toEqual([]);
    expect(inventory.activation.rootBoundRecipeOccurrences).toBe(0);
    expect(inventory.activation.crossVersionFeatureTokens).toEqual([]);
    expect(inventory.activation.teleports).toMatchObject({
      demoCount: 0,
      productionCount: 0,
    });
    expect(inventory.activation.documentSystemWriters).toEqual([]);
    expect(inventory.activation.documentSpecimenMarkers).toEqual([]);
    expect(inventory.activation.prototypeDocumentRoots).toEqual([]);
    expect(inventory.activation.baseVisualTokenReferences).toEqual([]);
    expect(inventory.activation.reviewComposable).toMatchObject({
      current: 'src/composables/useVisualReviewMode.js',
      references: [],
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
    expect(css.match(/^ {2}--ui-[\w-]+: initial;$/gmu)).toHaveLength(48);
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
      declarations: { v1: 292, v1Only: 48, v2: 407 },
      mode: 'check',
      production: { files: 0, pairs: 0, tokens: 0 },
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

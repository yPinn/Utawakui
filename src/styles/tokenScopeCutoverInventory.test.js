import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTokenV2MigrationInventory } from '../../scripts/token-v2-migration-inventory.mjs';

const root = resolve(import.meta.dirname, '../..');
const inventory = buildTokenV2MigrationInventory({ root });
const readSource = (projectPath) =>
  readFileSync(resolve(root, projectPath), 'utf8');

describe('Token v2 scope cutover preparation', () => {
  it('records current boundary violations as RED evidence for one atomic activation', () => {
    const evidence = {
      baseVisualTokens: inventory.activation.baseVisualTokenReferences.length,
      bodyTeleports:
        inventory.activation.teleports.productionCount +
        inventory.activation.teleports.demoCount,
      documentRootRecipes: inventory.activation.rootBoundRecipeOccurrences,
      documentSystemWriters: inventory.activation.documentSystemWriters.length,
      prototypeDocumentRoots:
        inventory.activation.prototypeDocumentRoots.length,
      specimenDocumentMarkers:
        inventory.activation.documentSpecimenMarkers.length,
    };

    expect(evidence).toEqual({
      baseVisualTokens: 8,
      bodyTeleports: 8,
      documentRootRecipes: 50,
      documentSystemWriters: 4,
      prototypeDocumentRoots: 2,
      specimenDocumentMarkers: 2,
    });
  });

  it('does not activate generated invalidation or a partial surface scope', () => {
    const mainEntry = readSource('src/main.js');
    const performerEntry = readSource('src/performer-main.js');
    const generatedInvalidation =
      './styles/token-v1-invalidation.generated.css';

    expect(mainEntry).not.toContain(generatedInvalidation);
    expect(performerEntry).not.toContain(generatedInvalidation);
    expect(mainEntry).toContain("import './styles/tokens.css';");
    expect(performerEntry).toContain("import './styles/tokens.css';");
    expect(readSource('src/styles/tokens.css')).toMatch(/^:root\s*\{/mu);
    expect(readSource('src/styles/tokens-v2.css')).toContain(
      ":root[data-ui-system='v2'] {",
    );
  });

  it('keeps every activation owner explicit instead of accepting a hybrid subset', () => {
    expect(inventory.activation).toEqual(
      expect.objectContaining({
        baseVisualTokenReferences: expect.any(Array),
        documentSpecimenMarkers: expect.any(Array),
        documentSystemWriters: expect.any(Array),
        prototypeDocumentRoots: expect.any(Array),
        reviewComposable: expect.any(Object),
        rootBoundRecipes: expect.any(Array),
        teleports: expect.any(Object),
        tokenEntries: expect.any(Object),
      }),
    );
  });
});

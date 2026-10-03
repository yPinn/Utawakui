import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTokenV2MigrationInventory } from '../../scripts/token-v2-migration-inventory.mjs';

const root = resolve(import.meta.dirname, '../..');
const inventory = buildTokenV2MigrationInventory({ root });
const readSource = (projectPath) =>
  readFileSync(resolve(root, projectPath), 'utf8');

describe('Token v2 scope cutover preparation', () => {
  it('closes every inventoried boundary violation in one atomic activation', () => {
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
      baseVisualTokens: 0,
      bodyTeleports: 0,
      documentRootRecipes: 0,
      documentSystemWriters: 0,
      prototypeDocumentRoots: 0,
      specimenDocumentMarkers: 0,
    });
  });

  it('activates both scoped entries and generated invalidation together', () => {
    const mainEntry = readSource('src/main.js');
    const performerEntry = readSource('src/performer-main.js');
    const generatedInvalidation =
      './styles/token-v1-invalidation.generated.css';

    expect(mainEntry).toContain(generatedInvalidation);
    expect(performerEntry).toContain(generatedInvalidation);
    expect(mainEntry).toContain("import './styles/tokens.css';");
    expect(performerEntry).toContain("import './styles/tokens.css';");
    expect(mainEntry).toContain("import './styles/tokens-v2.css';");
    expect(performerEntry).toContain("import './styles/tokens-v2.css';");
    expect(readSource('src/styles/tokens.css')).not.toMatch(/^:root\s*\{/mu);
    expect(readSource('src/styles/tokens.css')).toMatch(
      /^\[data-ui-system='v1'\]\s*\{/mu,
    );
    expect(readSource('src/styles/tokens-v2.css')).not.toContain(
      ":root[data-ui-system='v2']",
    );
    expect(readSource('src/styles/tokens-v2.css')).toContain(
      "[data-ui-system='v2'] {",
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

  it('keeps registered overlay hosts visible to the accessibility tree', () => {
    for (const path of [
      'src/App.vue',
      'src/performer/PerformerApp.vue',
      'src/views/VisualSystemView.vue',
      'src/views/InternalToolsView.vue',
      'prototypes/ui-component-lab/src/App.vue',
    ]) {
      const host = readSource(path).match(
        /<div\s+[^>]*class="ui-overlay-host"[^>]*\/>/u,
      )?.[0];

      expect(host, path).toBeDefined();
      expect(host, path).not.toContain('aria-hidden');
    }
  });
});

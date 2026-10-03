import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const importSource = readSource('../views/ImportView.vue');
const providerSource = readSource(
  '../components/import/ProviderImportPanel.vue',
);
const candidateSource = readSource(
  '../components/import/ImportCandidateOption.vue',
);

describe('Import Token v2 surface cutover', () => {
  it('keeps the long Import flow in Folder document mode with one page scroll owner', () => {
    expect(appSource).toContain(
      "const documentFolderViews = new Set(['setlist', 'import'])",
    );
    expect(appSource).toContain('<AppFolderPage :mode="folderPageMode">');
    expect(importSource).not.toMatch(/\.import-view\s*\{[^}]*overflow-y\s*:/su);
    expect(providerSource).toContain('<UiScrollRegion');
    expect(providerSource).toContain('class="preview-tracks"');
    expect(providerSource).toContain(
      'viewport-class="preview-tracks__viewport"',
    );
  });

  it('uses only formal v2 token names throughout the Import surface', () => {
    for (const source of [importSource, providerSource, candidateSource]) {
      expect(source).not.toContain('var(--ui-radius)');
      expect(source).not.toContain('var(--ui-font-weight-strong)');
    }
    expect(importSource).toContain('var(--ui-radius-md)');
    expect(importSource).toContain('var(--ui-font-weight-semibold)');
    expect(providerSource).toContain('var(--ui-radius-md)');
    expect(providerSource).toContain('var(--ui-font-weight-semibold)');
    expect(candidateSource).toContain('var(--ui-radius-md)');
    expect(candidateSource).toContain('var(--ui-font-weight-semibold)');
  });

  it('preserves the local, provider, candidate, progress, and retry anatomy', () => {
    expect(importSource).toContain('<UiPageHeader title="匯入" />');
    expect(importSource).toContain('class="local-import-panel"');
    expect(importSource).toContain('<ProviderImportPanel />');
    expect(providerSource).toContain('<ImportCandidateOption');
    expect(providerSource).toContain('@click="resolveSource"');
    expect(providerSource).toContain('@click="confirmImport"');
    expect(providerSource).toContain('@click="retryFailedTracks"');
    expect(providerSource).toContain("state.statusType === 'error'");
  });

  it('retains the existing domain component names without compatibility wrappers', () => {
    expect(importSource).toContain(
      "import ProviderImportPanel from '../components/import/ProviderImportPanel.vue'",
    );
    expect(providerSource).toContain(
      "import ImportCandidateOption from './ImportCandidateOption.vue'",
    );
    expect(importSource).not.toContain('LegacyImport');
    expect(providerSource).not.toContain('LegacyImport');
    expect(candidateSource).not.toContain('LegacyImport');
  });
});

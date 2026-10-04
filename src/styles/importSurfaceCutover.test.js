import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const folderPageSource = readSource('../components/layout/AppFolderPage.vue');
const importPageSource = readSource('../components/import/ImportPage.vue');
const importSource = readSource('../views/ImportView.vue');
const providerSource = readSource(
  '../components/import/ProviderImportPanel.vue',
);
const candidateSource = readSource(
  '../components/import/ImportCandidateOption.vue',
);

describe('Import Token v2 surface cutover', () => {
  it('keeps the long Import flow in Folder document mode with one page scroll owner', () => {
    expect(importPageSource).toMatch(
      /<AppSurfaceBoundary\s+surface-id="import">\s*<AppFolderPage\s+mode="document"\s+body-label="匯入內容">/u,
    );
    expect(importPageSource).toContain('<template #header>');
    expect(importPageSource).toContain('<UiPageHeader title="匯入" />');
    expect(importPageSource).not.toMatch(
      /<AppFolderPage[\s\S]*?<AppSurfaceBoundary\s+surface-id="import">/u,
    );
    expect(appSource).not.toContain('documentFolderViews');
    expect(appSource).not.toContain('folderPageMode');
    expect(importSource).not.toMatch(/\.import-view\s*\{[^}]*overflow-y\s*:/su);
    expect(providerSource).toContain('<UiScrollRegion');
    expect(providerSource).toContain('class="preview-tracks"');
    expect(providerSource).toContain(
      'viewport-class="preview-tracks__viewport"',
    );
  });

  it('uses Folder-owned outer inset and flat top-level source sections', () => {
    expect(folderPageSource).toContain(
      '--ui-scroll-layout-padding-block-start: var(--ui-folder-document-inset);',
    );
    expect(importSource).toMatch(
      /\.import-view\s*\{[^}]*gap:\s*var\(--ui-folder-section-gap\);/su,
    );
    for (const [componentSource, selector] of [
      [importSource, 'local-import-panel'],
      [providerSource, 'provider-import-panel'],
    ]) {
      expect(componentSource).not.toMatch(
        new RegExp(
          `\\.${selector}\\s*\\{[^}]*(?:padding|background|border|border-radius):`,
          'su',
        ),
      );
    }
  });

  it('keeps the local import action legible at the compact breakpoint', () => {
    expect(importSource).toContain('class="local-import-action__button"');
    expect(importSource).toMatch(
      /@media \(max-width:\s*680px\)[\s\S]*?\.local-import-action\s*\{[^}]*align-items:\s*center;[^}]*flex-wrap:\s*wrap;/u,
    );
    expect(importSource).toMatch(
      /@media \(max-width:\s*680px\)[\s\S]*?\.local-import-action__button\s*\{[^}]*flex:\s*1 0 100%;/u,
    );
  });

  it('uses only formal v2 token names throughout the Import surface', () => {
    for (const source of [importSource, providerSource, candidateSource]) {
      expect(source).not.toContain('var(--ui-radius)');
      expect(source).not.toContain('var(--ui-font-weight-strong)');
    }
    expect(importSource).toContain('var(--ui-radius-sm)');
    expect(importSource).toContain('var(--ui-font-weight-semibold)');
    expect(providerSource).toContain('var(--ui-radius-md)');
    expect(providerSource).toContain('var(--ui-font-weight-semibold)');
    expect(candidateSource).toContain('var(--ui-radius-md)');
    expect(candidateSource).toContain('var(--ui-font-weight-semibold)');
  });

  it('preserves the local, provider, candidate, progress, and retry anatomy', () => {
    expect(importPageSource).toContain('<UiPageHeader title="匯入" />');
    expect(importSource).not.toContain('UiPageHeader');
    expect(importSource).toContain('class="local-import-panel"');
    expect(importSource).toContain('<ProviderImportPanel />');
    expect(providerSource).toContain('<ImportCandidateOption');
    expect(providerSource).toContain('@click="resolveSource"');
    expect(providerSource).toContain('@click="confirmImport"');
    expect(providerSource).toContain('@click="retryFailedTracks"');
    expect(providerSource).toContain("state.statusType === 'error'");
  });

  it('retains the existing domain component names without compatibility wrappers', () => {
    expect(importPageSource).toContain(
      "import ImportView from '../../views/ImportView.vue'",
    );
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

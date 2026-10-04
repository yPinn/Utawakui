import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const pageUrl = new URL('./ImportPage.vue', import.meta.url);
const pageSource = existsSync(pageUrl) ? readFileSync(pageUrl, 'utf8') : '';
const importSource = readSource('../../views/ImportView.vue');
const appSource = readSource('../../App.vue');

describe('Import page composition contract', () => {
  it('keeps page identity fixed above the single document body', () => {
    expect(pageSource).toContain(
      "import AppFolderPage from '../layout/AppFolderPage.vue';",
    );
    expect(pageSource).toContain(
      "import UiPageHeader from '../ui/UiPageHeader.vue';",
    );
    expect(pageSource).toMatch(
      /<AppSurfaceBoundary\s+surface-id="import">\s*<AppFolderPage\s+mode="document"\s+body-label="匯入內容">/u,
    );
    expect(pageSource).toContain('<template #header>');
    expect(pageSource).toContain('<UiPageHeader title="匯入" />');
    expect(importSource).not.toContain('UiPageHeader');
  });

  it('owns the complete Import surface around the existing feature view', () => {
    expect(pageSource).toContain(
      "import ImportView from '../../views/ImportView.vue';",
    );
    expect(pageSource).toMatch(
      /<AppSurfaceBoundary\s+surface-id="import">[\s\S]*?<AppFolderPage[\s\S]*?<ImportView\s*\/>[\s\S]*?<\/AppFolderPage>\s*<\/AppSurfaceBoundary>/u,
    );
    expect(pageSource).not.toMatch(
      /<AppFolderPage[\s\S]*?<AppSurfaceBoundary\s+surface-id="import">/u,
    );
  });

  it('stays lazy while App routes page compositions without a document-mode special case', () => {
    expect(appSource).toMatch(
      /const\s+ImportPage\s*=\s*defineAsyncComponent\(\s*\(\)\s*=>\s*import\('\.\/components\/import\/ImportPage\.vue'\),?\s*\);/u,
    );
    expect(appSource).toContain('import: ImportPage');
    expect(appSource).toContain(
      "const pageComposedFolderViews = new Set(['setlist', 'output', 'import']);",
    );
    expect(appSource).toContain('v-if="activeViewOwnsFolderPage"');
    expect(appSource).toContain('<AppFolderPage v-else mode="workspace">');
    expect(appSource).not.toContain('documentFolderViews');
    expect(appSource).not.toContain('folderPageMode');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const pageUrl = new URL('./OutputPage.vue', import.meta.url);
const pageSource = existsSync(pageUrl) ? readFileSync(pageUrl, 'utf8') : '';
const workspaceSource = readSource('./ObsOutputWorkspace.vue');
const appSource = readSource('../../App.vue');
const displayPageSource = readSource('../../pages/DisplayPage.vue');

describe('Output page composition contract', () => {
  it('owns the complete Output surface around the existing feature view', () => {
    expect(pageSource).toContain(
      "import OutputView from '../../views/OutputView.vue';",
    );
    expect(pageSource).toContain(
      "import AppSurfaceBoundary from '../layout/AppSurfaceBoundary.vue';",
    );
    expect(pageSource).toContain('<AppSurfaceBoundary surface-id="output">');
    expect(pageSource).toContain('<OutputView />');
  });

  it('places the guarded Output mode tabs in a fixed workspace header', () => {
    expect(workspaceSource).toContain(
      "import AppFolderPage from '../layout/AppFolderPage.vue';",
    );
    expect(workspaceSource).toContain(
      '<AppFolderPage mode="workspace" body-label="輸出工作區">',
    );
    expect(workspaceSource).toMatch(
      /<template\s+#header>[\s\S]*?<UiSegmentedControl[\s\S]*?@update:model-value="selectPage"/u,
    );
    expect(workspaceSource).toContain('await appearanceAutosave.flush()');
    expect(workspaceSource).toContain(':preview-backdrop="previewBackdrop"');
    expect(workspaceSource).toContain(':show-lyrics-guide="showLyricsGuide"');
    expect(workspaceSource).toContain(
      '@update:preview-backdrop="selectPreviewBackdrop"',
    );
    expect(workspaceSource).toContain(
      '@update:show-lyrics-guide="setLyricsGuideVisible"',
    );
    expect(workspaceSource).not.toContain('obs-output-workspace__modebar');
  });

  it('stays lazy while App routes Output through its page owner', () => {
    expect(appSource).toMatch(
      /const\s+DisplayPage\s*=\s*defineAsyncComponent\(\s*\(\)\s*=>\s*import\('\.\/pages\/DisplayPage\.vue'\),?\s*\);/u,
    );
    expect(appSource).toContain('output: DisplayPage');
    expect(displayPageSource).toContain(
      "import OutputPage from '../components/output/OutputPage.vue';",
    );
    expect(displayPageSource).toContain('<OutputPage />');
    expect(appSource).toContain(
      "const pageComposedFolderViews = new Set(['setlist', 'output', 'import']);",
    );
    expect(appSource).not.toContain("output: 'output'");
  });
});

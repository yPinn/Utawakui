import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../utils/catalogSourceText.js';

const readSource = (path) => readCatalogSource(new URL(path, import.meta.url));
const workspaceSource = readSource(
  '../components/output/ObsOutputWorkspace.vue',
);
const appSource = readSource('../App.vue');
const displayPageSource = readSource('./DisplayPage.vue');

describe('Display page composition contract', () => {
  it('owns the destination surface and composes the Output workspace directly', () => {
    expect(displayPageSource).toContain(
      '<AppSurfaceBoundary surface-id="display">',
    );
    expect(displayPageSource).toContain(
      "import ObsOutputWorkspace from '../components/output/ObsOutputWorkspace.vue';",
    );
    expect(displayPageSource).toContain('<ObsOutputWorkspace');
    expect(displayPageSource).not.toContain('OutputPage');
    expect(displayPageSource).not.toContain('OutputView');
  });

  it('places the guarded Output mode tabs in a fixed workspace header', () => {
    expect(workspaceSource).toContain(
      "import AppFolderPage from '../layout/AppFolderPage.vue';",
    );
    expect(workspaceSource).toMatch(
      /<AppFolderPage\s+mode="workspace"\s+surface="canvas"\s+body-label="輸出工作區"\s*>/u,
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

  it('stays lazy while App routes Display through its page owner', () => {
    expect(appSource).toMatch(
      /const\s+loadDisplayPage\s*=\s*\(\)\s*=>\s*import\('\.\/pages\/DisplayPage\.vue'\);/u,
    );
    expect(appSource).toMatch(
      /const\s+DisplayPage\s*=\s*defineAsyncComponent\(loadDisplayPage\);/u,
    );
    expect(appSource).not.toMatch(/import\s+DisplayPage\s+from/u);
    expect(appSource).toContain('display: DisplayPage');
    expect(displayPageSource).toContain('getOutputWorkbenchData');
    expect(appSource).toMatch(
      /const pageComposedFolderViews = new Set\(\[[\s\S]*?'display'[\s\S]*?\]\);/u,
    );
    expect(appSource).not.toContain("output: 'output'");
  });
});

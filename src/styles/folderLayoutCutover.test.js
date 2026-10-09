import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Folder layout family cutover', () => {
  it('mounts only the formal Folder owners in production', () => {
    const app = readSource('../App.vue');

    expect(app).toContain(
      "import AppFolderLayout from './components/layout/AppFolderLayout.vue'",
    );
    expect(app).toContain(
      "import AppFolderPage from './components/layout/AppFolderPage.vue'",
    );
    expect(app).toContain(
      "import AppSurfaceBoundary from './components/layout/AppSurfaceBoundary.vue'",
    );
    expect(app).not.toContain('AppArchiveFrame');
    expect(app).not.toContain('AppTopTabs');
    expect(app).not.toContain('AppInnerPage');
    expect(
      existsSync(
        new URL('../components/layout/AppArchiveFrame.vue', import.meta.url),
      ),
    ).toBe(false);
    expect(
      existsSync(
        new URL('../components/layout/AppTopTabs.vue', import.meta.url),
      ),
    ).toBe(false);
    expect(
      existsSync(
        new URL('../components/layout/AppInnerPage.vue', import.meta.url),
      ),
    ).toBe(false);
  });

  it('makes F8 reuse the formal Folder implementation', () => {
    const demo = readSource('../components/demo/DemoPageLayoutAppearance.vue');

    expect(demo).toContain(
      "import AppFolderLayout from '../layout/AppFolderLayout.vue'",
    );
    expect(demo).toContain(
      "import AppFolderPage from '../layout/AppFolderPage.vue'",
    );
    expect(demo).toContain('<AppFolderLayout');
    expect(demo).toContain('<AppFolderPage');
    expect(demo).not.toContain('demo-page-layout__folder-tab');
    expect(demo).not.toContain('demo-page-layout__folder-shell');
    expect(demo).not.toContain('--demo-folder-color');
  });

  it('uses the formal Folder aliases and removes candidate aliases', () => {
    const tokens = readSource('./tokens.css');

    expect(tokens).toContain(
      '--ui-folder-layout-background: var(--ui-color-folder-primary)',
    );
    expect(tokens).toContain(
      '--ui-folder-page-background: var(--ui-color-surface)',
    );
    expect(tokens).toContain(
      '--ui-folder-content-background: var(--ui-color-canvas)',
    );
    expect(tokens).not.toMatch(/--ui-folder-bg(?:\s|:|-)/u);
    expect(tokens).not.toContain('--ui-folder-paper-bg');
    expect(tokens).not.toContain('--ui-folder-paper-text');
    expect(tokens).not.toContain('--ui-folder-selected-ring');
  });

  it('lets destination Folder aliases cross structural v2 boundaries', () => {
    const tokens = readSource('./tokens.css');
    const boundary = readSource('../components/layout/AppSurfaceBoundary.vue');
    const folderLayout = readSource('../components/layout/AppFolderLayout.vue');

    expect(tokens).toContain(
      "[data-ui-system='v2'][data-ui-surface-root='true'] {",
    );
    expect(tokens).not.toMatch(/^\[data-ui-system='v2'\]\s*\{/mu);
    expect(boundary).not.toMatch(
      /\.app-surface-boundary\s*\{[^}]*background\s*:/su,
    );
    expect(folderLayout).toContain(
      '--ui-folder-page-background: var(--ui-folder-sheet-background)',
    );
    expect(folderLayout).not.toContain('--ui-folder-interior-background');
  });

  it('keeps every feature behind a registered surface and overlay host', () => {
    const registry = readSource('../utils/rendererSurfaceRegistry.js');
    const app = readSource('../App.vue');
    const importPage = readSource('../components/import/ImportPage.vue');
    const outputPage = readSource('../components/output/OutputPage.vue');

    for (const surfaceId of ['lyrics', 'output', 'import']) {
      expect(registry).toContain(`surfaceId: '${surfaceId}'`);
      expect(registry).toContain(`overlayHostId: '${surfaceId}-overlay'`);
    }
    expect(app).toContain("lyrics: 'lyrics'");
    expect(app).not.toContain("output: 'output'");
    expect(importPage).toContain('<AppSurfaceBoundary surface-id="import">');
    expect(outputPage).toContain('<AppSurfaceBoundary surface-id="output">');
    expect(registry).toContain("surfaceId: 'setlist'");
    expect(registry).toContain("surfaceId: 'setlist-overlay'");
    expect(registry).toContain("surfaceId: 'performance-session-workspace'");
    expect(registry).toContain("parentSurfaceId: 'app-folder'");
  });
});

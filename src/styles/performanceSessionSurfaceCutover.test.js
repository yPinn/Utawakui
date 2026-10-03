import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const setlistSource = readSource('../views/SetlistView.vue');
const workspaceSource = readSource(
  '../components/performance-session/PerformanceSessionWorkspace.vue',
);

const renamedComponents = [
  ['SessionPreparationWorkspace', 'PerformanceSessionWorkspace'],
  ['SessionPlanList', 'PerformanceSessionPlanList'],
  ['SessionPlanReviewEditor', 'PerformanceSessionPlanEditor'],
  ['SessionManualItemForm', 'PerformanceSessionManualItemForm'],
];

describe('Performance Session Token v2 surface cutover', () => {
  it('moves every component to the domain owner without compatibility files', () => {
    for (const [legacyName, currentName] of renamedComponents) {
      expect(
        existsSync(
          new URL(`../components/playlists/${legacyName}.vue`, import.meta.url),
        ),
        legacyName,
      ).toBe(false);
      expect(
        existsSync(
          new URL(
            `../components/performance-session/${currentName}.vue`,
            import.meta.url,
          ),
        ),
        currentName,
      ).toBe(true);
    }
  });

  it('uses complete PerformanceSession names in the production composition', () => {
    expect(setlistSource).toContain(
      "import PerformanceSessionWorkspace from '../components/performance-session/PerformanceSessionWorkspace.vue'",
    );
    expect(setlistSource).toContain('<PerformanceSessionWorkspace');
    expect(workspaceSource).toContain(
      "import PerformanceSessionPlanList from './PerformanceSessionPlanList.vue'",
    );
    expect(workspaceSource).toContain(
      "import PerformanceSessionPlanEditor from './PerformanceSessionPlanEditor.vue'",
    );
    expect(workspaceSource).toContain(
      "import PerformanceSessionManualItemForm from './PerformanceSessionManualItemForm.vue'",
    );
    for (const [legacyName] of renamedComponents) {
      const legacyIdentifier = new RegExp(`\\b${legacyName}\\b`, 'u');
      expect(setlistSource).not.toMatch(legacyIdentifier);
      expect(workspaceSource).not.toMatch(legacyIdentifier);
    }
  });

  it('switches only an open Setlist preparation surface to Folder workspace mode', () => {
    expect(appSource).toMatch(
      /const folderPageMode = computed\(\(\) => \{[\s\S]*?activeView\.value === 'setlist'[\s\S]*?performanceSessionWorkspace\.isOpen\.value[\s\S]*?return 'workspace';[\s\S]*?documentFolderViews\.has\(activeView\.value\)[\s\S]*?'document'[\s\S]*?'workspace'/u,
    );
    expect(appSource).toContain(
      "const documentFolderViews = new Set(['setlist', 'import'])",
    );
  });

  it('keeps the Right Dock projection in its existing shell-owned component', () => {
    expect(appSource).toContain(
      "import PerformanceSessionPanel from './components/performance-session/PerformanceSessionPanel.vue'",
    );
    expect(appSource).toContain('<PerformanceSessionPanel');
    expect(appSource).not.toMatch(
      /<AppSurfaceBoundary[^>]+performance-session[^>]*>[\s\S]*?<PerformanceSessionPanel/u,
    );
  });

  it('removes legacy Session component selectors from the renamed workspace family', () => {
    const sources = renamedComponents.map(([, currentName]) =>
      readSource(`../components/performance-session/${currentName}.vue`),
    );
    for (const source of sources) {
      expect(source).not.toMatch(
        /\.(?:session-workspace|session-plan|session-review|session-manual)(?:\b|__|--)/u,
      );
    }
  });
});

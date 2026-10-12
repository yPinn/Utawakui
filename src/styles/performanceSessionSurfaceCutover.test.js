import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const pageSource = readSource('../pages/PerformancePage.vue');
const performanceSource = readSource(
  '../components/performance/PerformanceWorkspace.vue',
);
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
    expect(performanceSource).toContain(
      "import PerformanceSessionWorkspace from '../performance-session/PerformanceSessionWorkspace.vue'",
    );
    expect(performanceSource).toContain('<PerformanceSessionWorkspace');
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
      expect(performanceSource).not.toMatch(legacyIdentifier);
      expect(workspaceSource).not.toMatch(legacyIdentifier);
    }
  });

  it('composes Session preparation inside the Performance workspace', () => {
    expect(pageSource).toContain('surface-id="performance"');
    expect(pageSource).toContain('<AppFolderPage mode="workspace"');
    expect(performanceSource).toContain(
      'surface-id="performance-session-workspace"',
    );
    expect(performanceSource).toContain('detached-host');
    expect(appSource).toMatch(
      /const pageComposedFolderViews = new Set\(\[\s*'library',\s*'performance',\s*'display',?\s*\]\);/u,
    );
    expect(appSource).toContain('v-if="activeViewOwnsFolderPage"');
  });

  it('moves collection-source setup into the Performance workspace and removes the parallel Dock', () => {
    expect(workspaceSource).toContain('replaceFromCollection');
    expect(workspaceSource).toContain('prepareSelectedCollection');
    expect(workspaceSource).toContain('從清單建立');
    expect(appSource).not.toContain('PerformanceSessionPanel');
    expect(appSource).not.toContain('RIGHT_DOCK_SURFACE_SESSION');
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

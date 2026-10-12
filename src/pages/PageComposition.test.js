import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readPage(filename) {
  const url = new URL(filename, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

describe('destination Page composition', () => {
  it('lets Library own browse and lyrics-authoring composition', () => {
    const source = readPage('./LibraryPage.vue');

    expect(source).toContain(
      "import LibraryBrowseWorkspace from '../components/library/LibraryBrowseWorkspace.vue';",
    );
    expect(source).toContain('libraryWorkspace');
    expect(source).toContain('openLibraryContent');
    expect(source).not.toContain('ImportWorkspace');
    expect(source).toContain(
      "import('../components/lyrics/LyricsAuthoringWorkspace.vue')",
    );
    expect(source).toContain('<AppSurfaceBoundary');
    expect(source).toContain('surface-id="library"');
    expect(source).toContain(
      '<LibraryBrowseWorkspace v-if="libraryWorkspace === \'browse\'"',
    );
    expect(source).toContain('returnToLibrary');
    expect(source).toContain("focusAppDestinationTrigger('library')");
    expect(source).toContain("'library-page__content--workspace'");
  });

  it('gives Performance one Page owner for session preparation and live lyrics tools', () => {
    const source = readPage('./PerformancePage.vue');
    const workspace = readPage(
      '../components/performance/PerformanceWorkspace.vue',
    );

    expect(source).toContain('surface-id="performance"');
    expect(source).toContain('<PerformanceWorkspace />');
    expect(workspace).toContain('<UiTabs');
    expect(workspace).toContain('<PerformanceSessionWorkspace');
    expect(workspace).toContain('<PerformanceLyricsWorkspace');
    expect(workspace).toContain('performance-workspace__session-boundary');
    expect(workspace).toMatch(
      /\.performance-workspace__panel\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/su,
    );
    expect(workspace).not.toContain('演唱中');
    expect(workspace).not.toContain('已唱紀錄');
  });

  it('lets Display directly own the existing Output workspace composition', () => {
    const source = readPage('./DisplayPage.vue');

    expect(source).toContain(
      "import ObsOutputWorkspace from '../components/output/ObsOutputWorkspace.vue';",
    );
    expect(source).toContain('getOutputWorkbenchData');
    expect(source).toContain("import '../styles/features/output.css';");
    expect(source).toContain('surface-id="display"');
    expect(source).toContain('<ObsOutputWorkspace');
    expect(source).not.toContain('OutputPage');
    expect(source).not.toContain('OutputView');
  });

  it('gives Settings a Page owner inside the existing utility layout shell', () => {
    const source = readPage('./SettingsPage.vue');

    expect(source).toContain(
      "import SettingsView from '../views/SettingsView.vue';",
    );
    expect(source).toMatch(/<template>\s*<SettingsView\s*\/>\s*<\/template>/u);
    expect(source).not.toContain('AppUtilityPage');
  });
});

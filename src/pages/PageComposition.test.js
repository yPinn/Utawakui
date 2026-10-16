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

  it('gives Settings one scrolling neutral Folder document and registered surface owner', () => {
    const source = readPage('./SettingsPage.vue');

    expect(source).toContain(
      "import SettingsView from '../views/SettingsView.vue';",
    );
    expect(source).toContain(
      "import AppFolderPage from '../components/layout/AppFolderPage.vue';",
    );
    expect(source).toContain(
      "import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';",
    );
    expect(source).toContain(
      "import UiPageHeader from '../components/ui/UiPageHeader.vue';",
    );
    expect(source).toContain('surface-id="settings"');
    expect(source).toContain('<AppFolderPage mode="document"');
    expect(source).toContain('body-label="設定文件"');
    expect(source).toContain('<UiPageHeader title="設定"');
    expect(source).toContain('管理曲庫、音訊、應用程式與選用功能。');
    expect(source).toContain('<SettingsView />');
    expect(source).not.toContain('AppUtilityPage');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('four-destination cutover contract', () => {
  it('mounts Library, Performance, Display, and Settings as public app destinations', () => {
    const app = readSource('../App.vue');

    expect(app).toContain('library: LibraryPage');
    expect(app).toContain('performance: PerformancePage');
    expect(app).toContain('display: DisplayPage');
    expect(app).toContain('settings: SettingsPage');
    expect(app).not.toContain('setlist: LibraryPage');
    expect(app).not.toContain('lyrics: LyricsView');
    expect(app).not.toContain('import: ImportPage');
    expect(app).not.toContain('output: DisplayPage');
  });

  it('keeps contextual capabilities out of the public destination registry', () => {
    const registry = readSource('../utils/appDestinationRegistry.js');

    for (const legacyId of ['setlist', 'lyrics', 'output', 'import']) {
      expect(registry).not.toContain(`id: '${legacyId}'`);
    }
  });

  it('removes Performance Session composition from the Library browse owner', () => {
    const page = readSource('../components/library/LibraryBrowseWorkspace.vue');
    const view = readSource('../components/library/LibraryBrowseContent.vue');

    expect(page).not.toContain('usePerformanceSessionWorkspace');
    expect(page).not.toContain('performance-session-workspace');
    expect(view).not.toContain('usePerformanceSessionWorkspace');
    expect(view).not.toContain('<PerformanceSessionWorkspace');
  });

  it('removes legacy Setlist composition identities from production', () => {
    const libraryPage = readSource('./LibraryPage.vue');

    expect(libraryPage).not.toContain('SetlistPage');
    expect(libraryPage).not.toContain('SetlistView');
  });

  it('routes the Titlebar preparation command to the shell-owned Preparation Dock', () => {
    const app = readSource('../App.vue');
    const titlebar = readSource('../components/layout/AppTitleBar.vue');
    const sidebar = readSource('../components/layout/AppPlaylistSidebar.vue');
    const sidebarBody = readSource(
      '../components/playlists/PlaylistSidebar.vue',
    );

    expect(titlebar).toContain("'togglePreparation'");
    expect(titlebar).toContain("'toggleSettings'");
    expect(titlebar).toContain('@click="emit(\'togglePreparation\')"');
    expect(app).toContain('@toggle-preparation="togglePreparationSurface"');
    expect(app).toContain('RIGHT_DOCK_SURFACE_PREPARATION');
    expect(app).not.toContain('RIGHT_DOCK_SURFACE_IMPORT');
    expect(sidebar).not.toContain('openImport');
    expect(sidebarBody).not.toContain('importTracks');
    expect(sidebarBody).not.toContain('label="匯入曲目"');
  });

  it('keeps Import out of the Library page composition', () => {
    const page = readSource('./LibraryPage.vue');

    expect(page).not.toContain('ImportWorkspace');
    expect(page).not.toContain("surfaceId: 'import'");
    expect(page).not.toContain("'lyrics', 'import'");
  });

  it('removes legacy Import-page guidance from empty lyrics states', () => {
    const lyricsPanel = readSource(
      '../components/lyrics/LyricsDocumentPanel.vue',
    );

    expect(lyricsPanel).toContain('從頂部開啟「匯入」加入音訊檔');
    expect(lyricsPanel).not.toContain('請先到 Import');
  });
});

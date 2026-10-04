import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const pageSource = readSource('../components/playlists/SetlistPage.vue');
const setlistSource = readSource('../views/SetlistView.vue');
const headerSource = readSource(
  '../components/playlists/SetlistCollectionHeader.vue',
);
const dossierSource = readSource(
  '../components/playlists/LibraryEntityDossier.vue',
);
const tableSource = readSource(
  '../components/playlists/SetlistPlaylistTable.vue',
);
const studioTableSource = readSource(
  '../components/playlists/StudioLibraryTrackTable.vue',
);

describe('Setlist Token v2 surface cutover', () => {
  it('keeps Setlist in the Folder document mode and leaves page scrolling with AppFolderPage', () => {
    expect(appSource).toContain('setlist: SetlistPage');
    expect(pageSource).toMatch(
      /<AppSurfaceBoundary\s+surface-id="setlist">\s*<AppFolderPage\s+:mode="pageMode"/u,
    );
    expect(pageSource).toContain(
      "performanceSessionWorkspace.isOpen.value ? 'workspace' : 'document'",
    );
    expect(setlistSource).not.toMatch(
      /\.setlist-view(?!--session)[^{]*\{[^}]*overflow-y\s*:/su,
    );
  });

  it('hands the migrated Performance Session workspace to one v2 child boundary', () => {
    expect(setlistSource).toContain(
      "import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue'",
    );
    expect(setlistSource).toMatch(
      /<AppSurfaceBoundary\s+v-if="performanceSessionWorkspace\.isOpen\.value"\s+surface-id="performance-session-workspace"/u,
    );
    expect(setlistSource).toMatch(
      /<AppSurfaceBoundary[\s\S]*?<PerformanceSessionWorkspace[\s\S]*?<\/AppSurfaceBoundary>/u,
    );
    expect(setlistSource).toMatch(
      /\.setlist-view__session-boundary\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*0;[^}]*flex:\s*1;[^}]*flex-direction:\s*column;/su,
    );
  });

  it('keeps Setlist-owned modal and action menu inside the Setlist feature owner', () => {
    expect(pageSource).toMatch(
      /<AppSurfaceBoundary\s+surface-id="setlist">[\s\S]*?<AppFolderPage[\s\S]*?<SetlistView[\s\S]*?<\/AppFolderPage>[\s\S]*?<\/AppSurfaceBoundary>/u,
    );
    expect(pageSource).not.toMatch(
      /<AppFolderPage[\s\S]*?<AppSurfaceBoundary\s+surface-id="setlist">/u,
    );
    expect(setlistSource).toContain('<TrackMetadataModal');
    expect(setlistSource).toContain('<TrackActionMenu');
    expect(setlistSource).not.toContain('provideUiOverlayHost');
    expect(setlistSource).not.toContain('document.body');
  });

  it('uses only formal v2 names in the Setlist and Studio Library row slice', () => {
    const sources = [
      headerSource,
      dossierSource,
      tableSource,
      studioTableSource,
    ];
    const forbidden = [
      '--ui-font-weight-heavy',
      '--ui-font-weight-strong',
      '--ui-motion-fast',
      '--ui-motion-ease',
      '--ui-radius)',
      '--ui-playlist-row-selected-background',
    ];

    for (const source of sources) {
      for (const token of forbidden) expect(source).not.toContain(token);
    }

    expect(dossierSource).toContain('var(--ui-font-weight-bold)');
    expect(dossierSource).toContain('var(--ui-font-weight-semibold)');
    expect(headerSource).toContain('var(--ui-motion-duration-fast)');
    expect(headerSource).toContain('var(--ui-motion-easing-standard)');
    expect(tableSource).toContain('var(--ui-radius-md)');
    expect(studioTableSource).toContain(
      'color-mix(in srgb, var(--ui-color-text) 8%, transparent)',
    );
  });
});

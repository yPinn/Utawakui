import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const libraryPageSource = readSource('../pages/LibraryPage.vue');
const pageSource = readSource(
  '../components/library/LibraryBrowseWorkspace.vue',
);
const browseContentSource = readSource(
  '../components/library/LibraryBrowseContent.vue',
);
const headerSource = readSource(
  '../components/library/LibraryCollectionHeader.vue',
);
const dossierSource = readSource('../components/layout/AppFolderDossier.vue');
const tableSource = readSource('../components/track/TrackTable.vue');
const studioTableSource = readSource(
  '../components/playlists/StudioLibraryTrackTable.vue',
);

describe('Library Token v2 surface cutover', () => {
  it('keeps Library browse in Folder document mode with one page scroll owner', () => {
    expect(appSource).toContain('library: LibraryPage');
    expect(libraryPageSource).toContain(
      '<LibraryBrowseWorkspace v-if="libraryWorkspace === \'browse\'"',
    );
    expect(libraryPageSource).toContain('surface-id="library"');
    expect(pageSource).toContain('<AppFolderPage');
    expect(pageSource).toContain('mode="document"');
    expect(browseContentSource).not.toMatch(
      /\.library-browse-content[^{]*\{[^}]*overflow-y\s*:/su,
    );
  });

  it('keeps Performance Session out of the Library browse slice', () => {
    expect(pageSource).not.toContain('performance-session-workspace');
    expect(pageSource).not.toContain('usePerformanceSessionWorkspace');
    expect(browseContentSource).not.toContain('PerformanceSessionWorkspace');
    expect(browseContentSource).not.toContain('usePerformanceSessionWorkspace');
  });

  it('keeps Library-owned modal and action menu under the Library surface owner', () => {
    expect(libraryPageSource).toMatch(
      /<AppSurfaceBoundary[\s\S]*?surface-id="library"[\s\S]*?<LibraryBrowseWorkspace/u,
    );
    expect(pageSource).not.toContain('AppSurfaceBoundary');
    expect(browseContentSource).toContain('<TrackMetadataModal');
    expect(browseContentSource).toContain('<TrackActionMenu');
    expect(browseContentSource).not.toContain('provideUiOverlayHost');
    expect(browseContentSource).not.toContain('document.body');
  });

  it('uses only formal v2 names in the Library and Studio Library row slice', () => {
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
    expect(tableSource).toContain('border-radius: 0;');
    expect(tableSource).toContain('var(--ui-folder-ledger-rule');
    for (const source of [tableSource, studioTableSource]) {
      expect(source).toContain(
        'background: var(--ui-track-row-selected-surface);',
      );
      expect(source).not.toContain('--ui-row-active-shadow');
      expect(source).not.toContain('--ui-track-row-active-shadow');
    }
  });
});

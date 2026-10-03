import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const setlistSource = readSource('../views/SetlistView.vue');
const headerSource = readSource(
  '../components/playlists/SetlistPlaylistHeader.vue',
);
const tableSource = readSource(
  '../components/playlists/SetlistPlaylistTable.vue',
);
const studioTableSource = readSource(
  '../components/playlists/StudioLibraryTrackTable.vue',
);

describe('Setlist Token v2 surface cutover', () => {
  it('keeps Setlist in the Folder document mode and leaves page scrolling with AppFolderPage', () => {
    expect(appSource).toContain(
      "const documentFolderViews = new Set(['setlist', 'import'])",
    );
    expect(appSource).toContain('<AppFolderPage :mode="folderPageMode">');
    expect(setlistSource).not.toMatch(
      /\.setlist-view(?!--session)[^{]*\{[^}]*overflow-y\s*:/su,
    );
  });

  it('preserves the uncut Performance Session workspace as one v1 child boundary', () => {
    expect(setlistSource).toContain(
      "import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue'",
    );
    expect(setlistSource).toMatch(
      /<AppSurfaceBoundary\s+v-if="performanceSessionWorkspace\.isOpen\.value"\s+surface-id="performance-session-workspace"/u,
    );
    expect(setlistSource).toMatch(
      /<AppSurfaceBoundary[\s\S]*?<SessionPreparationWorkspace[\s\S]*?<\/AppSurfaceBoundary>/u,
    );
    expect(setlistSource).toMatch(
      /\.setlist-view__session-boundary\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*0;[^}]*flex:\s*1;[^}]*flex-direction:\s*column;/su,
    );
  });

  it('keeps Setlist-owned modal and action menu inside the Setlist feature owner', () => {
    expect(appSource).toMatch(
      /<AppSurfaceBoundary[\s\S]*?:surface-id="activeFolderFeatureSurface"[\s\S]*?<component :is="views\[activeView\]" \/>[\s\S]*?<\/AppSurfaceBoundary>/u,
    );
    expect(setlistSource).toContain('<TrackMetadataModal');
    expect(setlistSource).toContain('<TrackActionMenu');
    expect(setlistSource).not.toContain('provideUiOverlayHost');
    expect(setlistSource).not.toContain('document.body');
  });

  it('uses only formal v2 names in the Setlist and Studio Library row slice', () => {
    const sources = [headerSource, tableSource, studioTableSource];
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

    expect(headerSource).toContain('var(--ui-font-weight-bold)');
    expect(headerSource).toContain('var(--ui-font-weight-semibold)');
    expect(headerSource).toContain('var(--ui-motion-duration-fast)');
    expect(headerSource).toContain('var(--ui-motion-easing-standard)');
    expect(tableSource).toContain('var(--ui-radius-md)');
    expect(studioTableSource).toContain(
      'color-mix(in srgb, var(--ui-color-text) 8%, transparent)',
    );
  });
});

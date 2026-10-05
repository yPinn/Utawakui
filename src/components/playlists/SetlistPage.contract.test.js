import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../../App.vue');
const pageSource = readSource('./SetlistPage.vue');
const viewSource = readSource('../../views/SetlistView.vue');

describe('Setlist page composition', () => {
  it('owns one AppFolderPage with a fixed library header and feature body', () => {
    expect(pageSource).toContain(
      "import AppFolderPage from '../layout/AppFolderPage.vue'",
    );
    expect(pageSource).toMatch(
      /<AppSurfaceBoundary\s+surface-id="setlist">\s*<AppFolderPage\s+:mode="pageMode"/u,
    );
    expect(pageSource).toMatch(
      /<template\s+v-if="showLibraryHeader"\s+#header>[\s\S]*?<UiPageHeader[\s\S]*?<UiSearchBox/u,
    );
    expect(pageSource).toMatch(
      /<AppSurfaceBoundary\s+surface-id="setlist">[\s\S]*?<AppFolderPage[\s\S]*?<SetlistView\s+v-model:search-query="searchQuery"[\s\S]*?<\/AppFolderPage>\s*<\/AppSurfaceBoundary>/u,
    );
    expect(pageSource).not.toMatch(
      /<AppFolderPage[\s\S]*?<AppSurfaceBoundary\s+surface-id="setlist">/u,
    );
  });

  it('keeps the rich playlist header in content and removes the library header duplicate', () => {
    expect(viewSource).toContain(
      "import AppFolderContentField from '../components/layout/AppFolderContentField.vue'",
    );
    expect(viewSource).toContain('<SetlistCollectionHeader');
    expect(viewSource).toMatch(
      /<AppFolderContentField\s+:variant="contentFieldVariant"\s+aria-label="曲目清單與狀態"\s*>/u,
    );
    expect(viewSource).toContain('class="setlist-view__collection-header"');
    expect(viewSource).toContain(
      "const searchQuery = defineModel('searchQuery'",
    );
    expect(viewSource).not.toContain('UiPageHeader');
    expect(viewSource).not.toContain('UiSearchBox');
    expect(viewSource).not.toContain('setlist-view__page-header');
  });

  it('ends the primary track field before local album supporting content', () => {
    expect(viewSource).toContain(
      "import SetlistAlbumSupportingContent from '../components/playlists/SetlistAlbumSupportingContent.vue'",
    );
    expect(viewSource).toContain('const albumSupportingContent = computed(');
    expect(viewSource).toContain('<SetlistAlbumSupportingContent');
    expect(viewSource.indexOf('</AppFolderContentField>')).toBeLessThan(
      viewSource.indexOf('<SetlistAlbumSupportingContent'),
    );
    expect(viewSource).toContain('@select-album="selectPlaylistAction"');
  });

  it('uses the bounded field variant only for loading, error, and empty states', () => {
    expect(viewSource).toContain('const contentFieldVariant = computed(');
    expect(viewSource).toContain(':variant="contentFieldVariant"');
    expect(viewSource).toContain("'state'");
    expect(viewSource).toContain("'content'");
  });

  it('routes Setlist through its page owner instead of the generic page wrapper', () => {
    expect(appSource).toContain(
      "import SetlistPage from './components/playlists/SetlistPage.vue'",
    );
    expect(appSource).toContain('setlist: SetlistPage');
    expect(appSource).toContain(
      "const pageComposedFolderViews = new Set(['setlist', 'output', 'import'])",
    );
    expect(appSource).toContain('v-if="activeViewOwnsFolderPage"');
  });

  it('uses document mode for the library and workspace mode only for preparation', () => {
    expect(pageSource).toContain(
      "performanceSessionWorkspace.isOpen.value ? 'workspace' : 'document'",
    );
    expect(pageSource).toContain(
      '!performanceSessionWorkspace.isOpen.value && !selectedPlaylist.value',
    );
    expect(pageSource).toContain('const documentKey = computed(');
    expect(pageSource).toContain(':document-key="documentKey"');
  });
});

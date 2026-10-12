import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../../App.vue');
const pageSource = readSource('./LibraryBrowseWorkspace.vue');
const viewSource = readSource('./LibraryBrowseContent.vue');

describe('Library browse workspace composition', () => {
  it('uses Library-owned component and composable identities', () => {
    const legacyPaths = [
      '../playlists/SetlistAlbumCard.vue',
      '../playlists/SetlistAlbumSupportingContent.vue',
      '../playlists/SetlistCollectionHeader.vue',
      '../playlists/SetlistFolderArtifactLayer.vue',
      '../../composables/useSetlistAlbumContext.js',
      '../../composables/useSetlistFolderObjects.js',
    ];
    const libraryPaths = [
      './LibraryAlbumCard.vue',
      './LibraryAlbumSupportingContent.vue',
      './LibraryCollectionHeader.vue',
      './LibraryFolderArtifactLayer.vue',
      '../../composables/useLibraryAlbumContext.js',
      '../../composables/useLibraryFolderObjects.js',
    ];

    for (const path of legacyPaths) {
      expect(existsSync(new URL(path, import.meta.url))).toBe(false);
    }
    for (const path of libraryPaths) {
      expect(existsSync(new URL(path, import.meta.url))).toBe(true);
    }
  });

  it('remounts the object layer per Folder page and persists one layout batch', () => {
    expect(pageSource).toContain(':key="folderPageKey"');
    expect(pageSource).toContain('@layout-change="handleArtifactLayout"');
    expect(pageSource).toContain('folderObjects.saveLayout(entries, options)');
    expect(pageSource).not.toContain('artistSummaryLayout');
  });

  it('owns one AppFolderPage with the feature body and no page header', () => {
    expect(pageSource).toContain(
      "import AppFolderPage from '../layout/AppFolderPage.vue'",
    );
    expect(pageSource).toContain('<AppFolderPage');
    expect(pageSource).toContain('mode="document"');
    expect(pageSource).not.toContain('#header');
    expect(pageSource).not.toContain('UiPageHeader');
    expect(pageSource).not.toContain('UiSearchBox');
    expect(pageSource).toMatch(
      /<AppFolderPage[\s\S]*?<LibraryBrowseContent\s+v-model:search-query="searchQuery"[\s\S]*?<\/AppFolderPage>/u,
    );
    expect(pageSource).not.toContain('AppSurfaceBoundary');
  });

  it('keeps the rich playlist header in content and removes the library header duplicate', () => {
    expect(viewSource).toContain(
      "import AppFolderContentField from '../layout/AppFolderContentField.vue'",
    );
    expect(viewSource).toContain('<LibraryCollectionHeader');
    expect(viewSource).toMatch(
      /<AppFolderContentField\s+:variant="contentFieldVariant"\s+aria-label="曲目清單與狀態"\s*>/u,
    );
    expect(viewSource).toContain(
      'class="library-browse-content__collection-header"',
    );
    expect(viewSource).toContain(
      "const searchQuery = defineModel('searchQuery'",
    );
    expect(viewSource).not.toContain('UiPageHeader');
    expect(viewSource).not.toContain('UiSearchBox');
    expect(viewSource).not.toContain('library-browse-content__page-header');
  });

  it('ends the primary track field before local album supporting content', () => {
    expect(viewSource).toContain(
      "import LibraryAlbumSupportingContent from './LibraryAlbumSupportingContent.vue'",
    );
    expect(viewSource).toContain(
      'const { albumEntries, albumSupportingContent } = useLibraryAlbumContext()',
    );
    expect(viewSource).toContain('<LibraryAlbumSupportingContent');
    expect(viewSource.indexOf('</AppFolderContentField>')).toBeLessThan(
      viewSource.indexOf('<LibraryAlbumSupportingContent'),
    );
    expect(viewSource).toContain('@select-album="selectPlaylistAction"');
  });

  it('projects summary and user photos through one Folder-wide artifact layer', () => {
    expect(pageSource).toContain(
      "import { useLibraryAlbumContext } from '../../composables/useLibraryAlbumContext.js'",
    );
    expect(pageSource).toContain(
      "import LibraryFolderArtifactLayer from './LibraryFolderArtifactLayer.vue'",
    );
    expect(pageSource).toContain(
      "import FolderAssetPreviewModal from '../playlists/FolderAssetPreviewModal.vue'",
    );
    expect(pageSource).toContain('useLibraryFolderObjects');
    expect(pageSource).toContain(
      'const { albumSupportingContent } = useLibraryAlbumContext()',
    );
    expect(pageSource).toMatch(
      /<template\s+v-if="showFolderArtifacts"\s+#floating>[\s\S]*?<LibraryFolderArtifactLayer[\s\S]*?:objects="folderObjects\.objects\.value"/u,
    );
    expect(pageSource.indexOf('#floating')).toBeGreaterThan(
      pageSource.indexOf('<LibraryBrowseContent'),
    );
    expect(pageSource).not.toContain('#extension');
    expect(pageSource.match(/<LibraryFolderArtifactLayer/gu)).toHaveLength(1);
    expect(pageSource).toContain('<FolderAssetPreviewModal');
  });

  it('places one add-object menu on Folder ground only for bounded collection entities', () => {
    expect(pageSource).toContain('const folderPageIdentity = computed(');
    expect(pageSource).toContain('#folder-tools');
    expect(pageSource).toContain('新增頁面物件');
    expect(pageSource.indexOf('#folder-tools')).toBeGreaterThan(
      pageSource.indexOf('#floating'),
    );
    expect(pageSource).not.toContain('#page-tools');
    expect(pageSource).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue'",
    );
    expect(pageSource).not.toContain(
      "import UiButton from '../ui/UiButton.vue'",
    );
    expect(pageSource).toMatch(
      /#folder-tools>[\s\S]*?<UiIconButton[\s\S]*?:icon="Plus"[\s\S]*?:label="addObjectLabel"[\s\S]*?variant="command"[\s\S]*?aria-haspopup="menu"/u,
    );
    expect(pageSource).toMatch(
      /#folder-tools>[\s\S]*?<UiContextMenu[\s\S]*?:anchor-el="addObjectButton\?\.\$el \?\? null"[\s\S]*?:items="ADD_MENU_ITEMS"/u,
    );
    expect(pageSource).toMatch(
      /key: 'photo',\s*label: '照片',\s*value: 'photo'[\s\S]*?key: 'note',\s*label: '便條',\s*value: 'note'/u,
    );
    expect(pageSource).not.toMatch(
      /#folder-tools>[\s\S]*?<UiIconButton[\s\S]*?shape="circle"/u,
    );
    expect(pageSource).not.toMatch(/#folder-tools[^>]*>[\s\S]*?<UiButton/u);
    expect(pageSource).not.toContain('新增照片\n');
    expect(viewSource).not.toContain('<template #page-tools>');
    expect(viewSource).not.toContain('<slot name="page-tools"></slot>');
  });

  it('creates and edits notes through the editor modal and confirms removal', () => {
    // A note exists only after its editor saves; no blank card is created.
    expect(pageSource).toMatch(
      /function selectAddAction[\s\S]*?type === 'note'[\s\S]*?noteEditor\.value = \{ key: null \};[\s\S]*?return;/u,
    );
    expect(pageSource).toMatch(
      /async function saveNote[\s\S]*?folderObjects\.updateNote\(editor\.key, content\)[\s\S]*?folderObjects\.addNote\(content\)/u,
    );
    expect(pageSource).toContain('@edit-note="openNoteEditor"');
    expect(pageSource).toMatch(
      /<AppFolderNoteEditorModal[\s\S]*?:open="Boolean\(noteEditor\)"[\s\S]*?:mode="noteEditor\?\.key \? 'edit' : 'create'"[\s\S]*?@save="saveNote"/u,
    );
    expect(pageSource).toMatch(
      /async function confirmRemoveObject[\s\S]*?confirmation\.confirm\([\s\S]*?intent: 'danger'[\s\S]*?folderObjects\.remove\(key\)/u,
    );
    expect(pageSource).toMatch(
      /function toggleAddMenu\(event\) \{\s*event\.stopPropagation\(\);/u,
    );
    expect(pageSource).toContain('@click="toggleAddMenu"');
    expect(pageSource).not.toContain('editingNoteKey');
    expect(pageSource).toContain(':fresh-keys="folderObjects.freshKeys.value"');
    expect(pageSource).toContain('@remove="confirmRemoveObject"');
  });

  it('retains the preview asset through its leave transition before releasing it', () => {
    expect(pageSource).toContain('const selectedAsset = shallowRef(null)');
    expect(pageSource).toContain('const previewOpen = shallowRef(false)');
    expect(pageSource).toContain('previewOpen.value = false');
    expect(pageSource).toMatch(
      /function finishAssetPreviewClose\(\)[\s\S]*?selectedAsset\.value = null/u,
    );
    expect(pageSource).toMatch(
      /<FolderAssetPreviewModal[\s\S]*?:open="previewOpen"[\s\S]*?:asset="selectedAsset"[\s\S]*?@close="closeAssetPreview"[\s\S]*?@after-leave="finishAssetPreviewClose"/u,
    );
  });

  it('shares one album context projection while keeping related albums on paper', () => {
    expect(viewSource).toContain(
      "import { useLibraryAlbumContext } from '../../composables/useLibraryAlbumContext.js'",
    );
    expect(viewSource).toContain(
      'const { albumEntries, albumSupportingContent } = useLibraryAlbumContext()',
    );
    expect(viewSource).toContain(
      'v-if="albumSupportingContent?.relatedAlbums.length > 0"',
    );
    expect(viewSource).not.toContain(
      ':summary="albumSupportingContent.summary"',
    );
    expect(viewSource).toContain('@select-artist="openAlbumArtist"');
    expect(viewSource).toContain('@play-album="toggleSupportingAlbumPlayback"');
  });

  it('uses the bounded field variant only for loading, error, and empty states', () => {
    expect(viewSource).toContain('const contentFieldVariant = computed(');
    expect(viewSource).toContain(':variant="contentFieldVariant"');
    expect(viewSource).toContain("'state'");
    expect(viewSource).toContain("'content'");
  });

  it('routes Library through its page owner instead of the generic page wrapper', () => {
    expect(appSource).toContain(
      "import LibraryPage from './pages/LibraryPage.vue'",
    );
    expect(appSource).toContain('library: LibraryPage');
    expect(appSource).toMatch(
      /const pageComposedFolderViews = new Set\(\[\s*'library',\s*'performance',\s*'display',?\s*\]\);/u,
    );
    expect(appSource).toContain('v-if="activeViewOwnsFolderPage"');
  });

  it('uses document mode for the Library browse workspace', () => {
    expect(pageSource).toContain('mode="document"');
    expect(pageSource).toContain('const documentKey = computed(');
    expect(pageSource).toContain(':document-key="documentKey"');
  });

  // Spotify-style: library views use the same dossier header as collections.
  it('gives every library view the collection dossier header', () => {
    expect(pageSource).not.toContain('showLibraryHeader');
    expect(viewSource).toContain(
      `:entity-kind="mode === 'all' ? 'library' : mode"`,
    );
    expect(viewSource).toMatch(
      /if \(mode\.value === 'all'\) return `library:\$\{playlistState\.libraryView\}`;/u,
    );
    expect(pageSource).toMatch(
      /selectedPlaylist\.value\?\.id \?\?\s*playlistState\.selectedArtistId \?\?\s*`library:/u,
    );
  });

  it('reveals a compact bar and sticky table header once the dossier scrolls away', () => {
    expect(viewSource).toContain(
      'const compactBarVisible = useScrolledPast(collectionHeader);',
    );
    expect(viewSource).toMatch(
      /<AppFolderCompactBar[\s\S]*?:visible="compactBarVisible"[\s\S]*?<PlaybackPrimaryButton/u,
    );
    expect(viewSource).toContain('ref="collectionHeader"');
    expect(viewSource).toContain(':style="stickyOffsetStyle"');
    expect(viewSource).not.toContain('v-model:view-mode');
    expect(viewSource).toContain(':density="trackListDensity"');
  });
});

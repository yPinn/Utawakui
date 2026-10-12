import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LibraryCollectionHeader from './LibraryCollectionHeader.vue';

const source = readFileSync(
  new URL('./LibraryCollectionHeader.vue', import.meta.url),
  'utf8',
);

async function renderHeader(overrides = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(LibraryCollectionHeader, {
          entityKind: 'album',
          title: 'AIR·艾熱',
          titleId: 'album-title-test',
          artist: '艾熱',
          fields: ['2018', '9 首曲目，29 分'],
          description: '本機曲庫中的專輯資料。',
          canPlay: true,
          canShuffle: true,
          canAddToQueue: true,
          ...overrides,
        }),
    }),
  );
}

describe('LibraryCollectionHeader', () => {
  it('composes one shared entity dossier with one collection action rail', async () => {
    const html = await renderHeader();

    expect(source).toContain(
      "import LibraryEntityDossier from './LibraryEntityDossier.vue'",
    );
    expect(source).toContain(
      "import CollectionActionRail from './CollectionActionRail.vue'",
    );
    expect(html).toContain('id="album-title-test"');
    expect(html).toContain('aria-labelledby="album-title-test"');
    expect(html).toMatch(/app-folder-dossier__marker[^>]*>\s*專輯\s*</u);
    expect(html).toContain('艾熱');
    expect(html).toContain('9 首曲目，29 分');
  });

  it('assigns playlist edit and album add-to-playlist as different extension actions', async () => {
    const playlistHtml = await renderHeader({ entityKind: 'playlist' });
    const albumHtml = await renderHeader({
      entityKind: 'album',
      addToPlaylistItems: [{ label: '工作歌單', value: 'playlist-1' }],
    });

    expect(playlistHtml).toContain('編輯播放清單詳細資料');
    expect(albumHtml).toContain('將專輯新增至播放清單');
    expect(source).toContain("emit('openEditDetails')");
    expect(source).toContain("emit('menuAction', value)");
  });

  it('renders artist pages as a round, read-only reference without an extension action', async () => {
    const html = await renderHeader({
      entityKind: 'artist',
      title: 'YOASOBI',
      artist: '',
      description: '',
      fields: ['18 首曲目', '3 張專輯', '2019–2024'],
    });

    expect(html).toMatch(/app-folder-dossier__marker[^>]*>\s*藝人\s*</u);
    expect(html).toContain('app-folder-dossier__artwork--round');
    expect(html).toContain('播放此藝人');
    expect(html).toContain('選擇藝人照片');
    expect(html).not.toContain('將專輯新增至播放清單');
    expect(html).not.toContain('編輯播放清單詳細資料');
    expect(source).toContain("emit('choosePhoto')");
  });

  it('makes the whole round avatar the photo action and invites an upload when empty', async () => {
    const artist = {
      entityKind: 'artist',
      title: 'YOASOBI',
      artist: '',
      description: '',
    };
    const empty = await renderHeader(artist);
    const withPhoto = await renderHeader({
      ...artist,
      coverUrl:
        'utawakui-media://artist-photo/artist-0123456789abcdef/photo.jpg',
    });

    expect(empty).toContain('library-collection-header__photo-action--empty');
    expect(empty).not.toContain('新增照片');
    expect(withPhoto).not.toContain(
      'library-collection-header__photo-action--empty',
    );
    expect(withPhoto).toContain('更換照片');
    expect(withPhoto).toContain('aria-label="選擇藝人照片"');
    // Fill and clip come from the dossier's shared overlay plane.
    expect(source).toContain(
      'v-else-if="entityKind === \'artist\'" #artwork-overlay',
    );
    expect(source).not.toMatch(
      /\.library-collection-header__photo-action\s*\{[^}]*(?:position:|inset:|border-radius:)/su,
    );
    // With a photo the action reveals through UiArtworkReveal; the empty
    // avatar keeps its add glyph visible in a plain wrapper.
    expect(source).toContain(':is="coverUrl ? UiArtworkReveal : \'span\'"');
    expect(empty).not.toContain('ui-artwork-reveal');
    expect(withPhoto).toContain('ui-artwork-reveal');
    expect(source).not.toMatch(
      /\.library-collection-header__photo-action\s*\{[^}]*opacity:/su,
    );
  });

  it('replaces the empty avatar text with one centered add glyph and a tooltip', async () => {
    const html = await renderHeader({
      entityKind: 'artist',
      title: 'YOASOBI',
      artist: '',
      description: '',
    });
    const button = html.slice(
      html.indexOf('library-collection-header__photo-action'),
      html.indexOf(
        '</button>',
        html.indexOf('library-collection-header__photo-action'),
      ),
    );

    expect(button).toContain('lucide-user-round-plus');
    expect(button).not.toContain('library-collection-header__photo-label');
    expect(source).toContain('v-bind="photoTooltipTriggerProps"');
    expect(source).toMatch(
      /useTooltip\(\{[\s\S]*?text: '選擇藝人照片',[\s\S]*?disabled: computed\(\(\) => Boolean\(props\.coverUrl\)\),/u,
    );
    expect(source).not.toContain("from '../ui/UiTooltip.vue'");
    expect(source).not.toMatch(
      /\.library-collection-header__photo-action--empty\s*\{[^}]*justify-content:\s*flex-end/su,
    );
    expect(source).toMatch(
      /\.app-folder-dossier__artwork:has\(\s*\.library-collection-header__photo-action--empty\s*\)\s*\.ui-collage-thumb__single-empty\s*\)\s*\{\s*visibility:\s*hidden;/su,
    );
  });

  it('keeps the dossier hairline outside the artwork so it stays centered', () => {
    const dossierSource = readFileSync(
      new URL('../layout/AppFolderDossier.vue', import.meta.url),
      'utf8',
    );
    expect(dossierSource).toMatch(
      /\.app-folder-dossier__artwork\s*\{[^}]*box-sizing:\s*content-box;/su,
    );
    expect(dossierSource).not.toMatch(
      /\.app-folder-dossier__artwork\s*\{[^}]*width:\s*136px;/su,
    );
    expect(dossierSource).toContain(
      'grid-template-columns: max-content minmax(0, 1fr);',
    );
  });

  it('links the album artist to the artist page when a label is provided', async () => {
    const linked = await renderHeader({ artistLinkLabel: '前往藝人：艾熱' });
    const plain = await renderHeader();

    expect(linked).toContain('aria-label="前往藝人：艾熱"');
    expect(plain).not.toContain('library-entity-dossier__artist-link');
  });

  it('keeps domain state in the parent and exposes explicit intent events', () => {
    for (const event of [
      'togglePlayback',
      'toggleShuffle',
      'addToQueue',
      'openEditDetails',
      'menuAction',
      'selectArtist',
      'update:searchQuery',
    ]) {
      expect(source).toContain(`'${event}'`);
    }
    expect(source).not.toContain('usePlayer');
    expect(source).not.toContain('usePlaybackQueue');
    expect(source).not.toContain('usePlaylists');
  });

  it('does not own or forward Folder page asset controls', () => {
    expect(source).not.toContain('page-tools');
    expect(source).not.toContain('useLibraryFolderAssets');
  });
});

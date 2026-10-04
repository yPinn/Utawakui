import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SetlistCollectionHeader from './SetlistCollectionHeader.vue';

const source = readFileSync(
  new URL('./SetlistCollectionHeader.vue', import.meta.url),
  'utf8',
);

async function renderHeader(overrides = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(SetlistCollectionHeader, {
          entityKind: 'album',
          title: 'AIR·艾熱',
          titleId: 'album-title-test',
          artist: '艾熱',
          meta: '2018 · 9 首曲目 · 29 分',
          description: '本機曲庫中的專輯資料。',
          canPlay: true,
          canShuffle: true,
          canAddToQueue: true,
          ...overrides,
        }),
    }),
  );
}

describe('SetlistCollectionHeader', () => {
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
    expect(html).toContain('專輯資料');
    expect(html).toContain('艾熱');
    expect(html).toContain('2018 · 9 首曲目 · 29 分');
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

  it('keeps domain state in the parent and exposes explicit intent events', () => {
    for (const event of [
      'togglePlayback',
      'toggleShuffle',
      'addToQueue',
      'openEditDetails',
      'menuAction',
      'update:searchQuery',
    ]) {
      expect(source).toContain(`'${event}'`);
    }
    expect(source).not.toContain('usePlayer');
    expect(source).not.toContain('usePlaybackQueue');
    expect(source).not.toContain('usePlaylists');
  });
});

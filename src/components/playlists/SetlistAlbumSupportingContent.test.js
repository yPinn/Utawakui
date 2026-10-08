import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SetlistAlbumSupportingContent from './SetlistAlbumSupportingContent.vue';

const source = readFileSync(
  new URL('./SetlistAlbumSupportingContent.vue', import.meta.url),
  'utf8',
);

describe('SetlistAlbumSupportingContent', () => {
  it('renders local related albums before the artist library summary', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(SetlistAlbumSupportingContent, {
            artist: '王以太',
            relatedAlbums: [
              {
                id: 'album-b',
                name: '演說家',
                coverUrl: '',
                tracks: [{ id: 'track-b', title: '目不轉睛' }],
                releaseYear: 2018,
              },
            ],
            summary: {
              albumCount: 2,
              trackCount: 18,
              yearStart: 2018,
              yearEnd: 2024,
            },
          }),
      }),
    );

    expect(html).toContain('更多來自 王以太 的內容');
    expect(html).toContain('aria-label="開啟專輯：演說家"');
    expect(html).toContain('藝人曲庫摘要');
    expect(html.indexOf('更多來自 王以太 的內容')).toBeLessThan(
      html.indexOf('藝人曲庫摘要'),
    );
    expect(html).toContain('18 首曲目');
    expect(html).toContain('2 張專輯');
    expect(html).toContain('2018–2024');
  });

  it('keeps the local artist summary when no related album is available', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(SetlistAlbumSupportingContent, {
            artist: '王以太',
            relatedAlbums: [],
            summary: {
              trackCount: 1,
              albumCount: 1,
              yearStart: 2024,
              yearEnd: 2024,
            },
          }),
      }),
    );

    expect(html).not.toContain('更多來自 王以太 的內容');
    expect(html).toContain('藝人曲庫摘要');
    expect(html).toContain('1 首曲目');
    expect(html).toContain('1 張專輯');
  });

  it('offers the artist page from the album summary only when asked', async () => {
    const render = (canOpenArtist) =>
      renderToString(
        createSSRApp({
          render: () =>
            h(SetlistAlbumSupportingContent, {
              artist: '王以太',
              summary: { trackCount: 1, albumCount: 1 },
              canOpenArtist,
            }),
        }),
      );

    expect(await render(true)).toContain('aria-label="查看藝人：王以太"');
    expect(await render(false)).not.toContain('查看藝人');
    expect(source).toContain("emit('selectArtist')");
  });

  it('reuses the album grid on artist pages under its own heading', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(SetlistAlbumSupportingContent, {
            artist: 'YOASOBI',
            albumsTitle: '專輯',
            relatedAlbums: [
              {
                id: 'album-a',
                name: 'THE BOOK',
                coverUrl: '',
                tracks: [],
                releaseYear: 2021,
              },
            ],
          }),
      }),
    );

    expect(html).toContain('專輯');
    expect(html).not.toContain('更多來自 YOASOBI 的內容');
    expect(html).not.toContain('藝人曲庫摘要');
    expect(html).toContain('aria-label="開啟專輯：THE BOOK"');
  });

  it('projects the active album as Pause and keeps inactive albums as Play', async () => {
    const render = (playingAlbumId = '') =>
      renderToString(
        createSSRApp({
          render: () =>
            h(SetlistAlbumSupportingContent, {
              artist: 'YOASOBI',
              relatedAlbums: [
                {
                  id: 'album-a',
                  name: 'THE BOOK',
                  coverUrl: '',
                  tracks: [{ id: 'track-a', title: '群青' }],
                  releaseYear: 2021,
                },
              ],
              playingAlbumId,
            }),
        }),
      );

    expect(await render()).toContain('播放專輯：THE BOOK');
    expect(await render('album-a')).toContain('暫停專輯：THE BOOK');
  });

  it('delegates each repeated item to the shared supporting-content card', () => {
    expect(source).toContain(
      "import SetlistAlbumCard from './SetlistAlbumCard.vue'",
    );
    expect(source).toContain('<SetlistAlbumCard');
    expect(source).toContain('@select="emit(\'selectAlbum\', $event)"');
    expect(source).toContain(':playing="album.id === playingAlbumId"');
    expect(source).toContain('@play="emit(\'playAlbum\', $event)"');
    expect(source).not.toContain('RELATED_ALBUM_COVER_SIZE');
  });
});

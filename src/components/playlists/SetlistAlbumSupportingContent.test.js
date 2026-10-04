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

    expect(html).toContain('更多來自王以太的專輯');
    expect(html).toContain('aria-label="開啟專輯：演說家"');
    expect(html).toContain('演出者曲庫摘要');
    expect(html.indexOf('更多來自王以太的專輯')).toBeLessThan(
      html.indexOf('演出者曲庫摘要'),
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

    expect(html).not.toContain('更多來自王以太的專輯');
    expect(html).toContain('演出者曲庫摘要');
    expect(html).toContain('1 首曲目');
    expect(html).toContain('1 張專輯');
  });

  it('uses one flat supporting region instead of card chrome', () => {
    expect(source).toContain("emit('selectAlbum', album.id)");
    expect(source).not.toMatch(/box-shadow\s*:/u);
    expect(source).not.toMatch(/border-radius\s*:/u);
    expect(source).not.toMatch(
      /background:\s*var\(--ui-color-surface-raised\)/u,
    );
  });
});

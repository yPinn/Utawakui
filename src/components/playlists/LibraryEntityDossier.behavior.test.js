import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LibraryEntityDossier from './LibraryEntityDossier.vue';

const source = readFileSync(
  new URL('./LibraryEntityDossier.vue', import.meta.url),
  'utf8',
);

async function renderDossier(overrides = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(LibraryEntityDossier, {
          entityKind: 'album',
          title: 'AIR·艾熱',
          titleId: 'entity-title-test',
          artist: '艾熱',
          artistLinkLabel: '前往藝人：艾熱',
          meta: '2018 · 9 首曲目 · 29 分',
          description: '本機曲庫中的專輯資料。',
          ...overrides,
        }),
    }),
  );
}

describe('LibraryEntityDossier', () => {
  it('is a header region on the continuous Folder paper', () => {
    const sheetRule = source.match(
      /\.library-entity-dossier__sheet\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;

    expect(sheetRule).toContain(
      'background: var(--ui-folder-dossier-background, transparent);',
    );
    expect(sheetRule).toContain('border: 0;');
    expect(sheetRule).toContain('border-radius: 0;');
    expect(sheetRule).not.toContain('box-shadow');
  });

  it('keeps marker, title, relation, meta, and description in one identity column', async () => {
    const html = await renderDossier();
    const contentStart = html.indexOf('library-entity-dossier__content');
    const marker = html.indexOf('專輯資料');
    const title = html.indexOf('id="entity-title-test"');
    const relation = html.indexOf('前往藝人：艾熱');
    const meta = html.indexOf('2018 · 9 首曲目 · 29 分');
    const description = html.indexOf('本機曲庫中的專輯資料。');

    expect(contentStart).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(contentStart);
    expect(title).toBeGreaterThan(marker);
    expect(relation).toBeGreaterThan(title);
    expect(meta).toBeGreaterThan(relation);
    expect(description).toBeGreaterThan(meta);
    expect(source).not.toContain('library-entity-dossier__heading');
  });

  it('keeps a sparse artist identity complete without an empty text column', async () => {
    const html = await renderDossier({
      entityKind: 'artist',
      title: '王以太',
      artist: '',
      artistLinkLabel: '',
      description: '',
      meta: '14 首曲目 · 1 張專輯 · 2019',
    });
    const contentStart = html.indexOf('library-entity-dossier__content');
    const marker = html.indexOf('藝人資料');
    const title = html.indexOf('id="entity-title-test"');
    const meta = html.indexOf('14 首曲目 · 1 張專輯 · 2019');

    expect(html).toContain('library-entity-dossier__artwork--round');
    expect(marker).toBeGreaterThan(contentStart);
    expect(title).toBeGreaterThan(marker);
    expect(meta).toBeGreaterThan(title);
  });

  it('preserves playlist collage and album artist-link variants', async () => {
    const playlist = await renderDossier({
      entityKind: 'playlist',
      title: '演出歌單',
      artist: '',
      artistLinkLabel: '',
      coverTracks: [
        { id: 'track-1', title: '第一首', coverUrl: 'cover-1.jpg' },
        { id: 'track-2', title: '第二首', coverUrl: 'cover-2.jpg' },
      ],
    });
    const album = await renderDossier();

    expect(playlist).toContain('播放清單資料');
    expect(source).toContain(':can-collage="entityKind === \'playlist\'"');
    expect(album).toContain('library-entity-dossier__artist-link');
    expect(album).toContain('aria-label="前往藝人：艾熱"');
  });
});

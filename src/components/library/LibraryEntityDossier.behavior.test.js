import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LibraryEntityDossier from './LibraryEntityDossier.vue';

const source = readFileSync(
  new URL('./LibraryEntityDossier.vue', import.meta.url),
  'utf8',
);
const dossierSource = readFileSync(
  new URL('../layout/AppFolderDossier.vue', import.meta.url),
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
          fields: ['2018', '9 首曲目，29 分'],
          description: '本機曲庫中的專輯資料。',
          ...overrides,
        }),
    }),
  );
}

function rule(text, selector) {
  const start = text.indexOf(`${selector} {`);
  return start < 0 ? '' : text.slice(start, text.indexOf('}', start));
}

describe('LibraryEntityDossier', () => {
  it('uses the same Chinese release type for the detail marker', async () => {
    const html = await renderDossier({ releaseType: 'ep' });
    expect(
      html.slice(
        html.indexOf('app-folder-dossier__marker'),
        html.indexOf('id="entity-title-test"'),
      ),
    ).toContain('迷你專輯');
  });
  it('composes the shared Folder dossier on the continuous paper', () => {
    expect(source).toContain(
      "import AppFolderDossier from '../layout/AppFolderDossier.vue'",
    );
    expect(rule(dossierSource, '.app-folder-dossier__body')).toContain(
      'background: var(--ui-folder-dossier-background, transparent);',
    );
    expect(dossierSource).not.toMatch(/box-shadow/u);
  });

  it('orders marker, title, one summary line and description', async () => {
    const html = await renderDossier();
    const marker = html.indexOf('app-folder-dossier__marker');
    const title = html.indexOf('id="entity-title-test"');
    const summary = html.indexOf('app-folder-dossier__summary');
    const owner = html.indexOf('前往藝人：艾熱');
    const year = html.indexOf('>2018<');
    const count = html.indexOf('9 首曲目，29 分');
    const description = html.indexOf('本機曲庫中的專輯資料。');

    expect(html.slice(marker, title)).toContain('專輯');
    expect(title).toBeGreaterThan(marker);
    expect(summary).toBeGreaterThan(title);
    expect(owner).toBeGreaterThan(summary);
    expect(year).toBeGreaterThan(owner);
    expect(count).toBeGreaterThan(year);
    expect(description).toBeGreaterThan(count);
  });

  it('uses the display face for titles and the utility face for the summary', () => {
    expect(rule(dossierSource, '.app-folder-dossier__title')).toContain(
      'font-family: var(--ui-font-family-display);',
    );
    expect(rule(dossierSource, '.app-folder-dossier__summary')).toContain(
      'font-family: var(--ui-font-family-utility);',
    );
    expect(rule(dossierSource, '.app-folder-dossier__field')).toContain(
      'font-family: var(--ui-font-family-utility);',
    );
  });

  it('keeps a sparse artist identity round and complete', async () => {
    const html = await renderDossier({
      entityKind: 'artist',
      title: '王以太',
      artist: '',
      artistLinkLabel: '',
      description: '',
      fields: ['14 首曲目，49 分', '1 張專輯', '2019'],
    });

    expect(html).toContain('app-folder-dossier__artwork--round');
    expect(html).toContain('14 首曲目，49 分');
    expect(html).not.toContain('app-folder-dossier__owner');
    expect(html).not.toContain('app-folder-dossier__description');
  });

  it('renders library views with an icon plate and no content language', async () => {
    const html = await renderDossier({
      entityKind: 'library',
      title: '全部曲目',
      artist: '',
      artistLinkLabel: '',
      description: '',
      fields: ['128 首曲目，8 小時'],
    });

    expect(html).toContain('library-entity-dossier__icon');
    expect(html).not.toContain('ui-collage-thumb');
    expect(html.slice(html.indexOf('app-folder-dossier__marker'))).toContain(
      '曲庫',
    );
    expect(html).not.toMatch(/<h1[^>]*lang=/u);
  });

  it('tags user-content titles and owners with their language', async () => {
    const html = await renderDossier({
      title: '演.说.家',
      artist: '王以太',
      artistLinkLabel: '前往藝人：王以太',
    });

    expect(html).toMatch(/<h1[^>]*lang="zh-Hans"/u);
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

    expect(
      playlist.slice(playlist.indexOf('app-folder-dossier__marker')),
    ).toContain('播放清單');
    expect(source).toContain(':can-collage="entityKind === \'playlist\'"');
    expect(album).toContain('library-entity-dossier__artist-link');
    expect(album).toContain('aria-label="前往藝人：艾熱"');
  });
});

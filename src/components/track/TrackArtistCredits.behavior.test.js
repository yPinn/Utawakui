import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const artistIndexState = { index: null };
const jumpToArtist = vi.fn();

vi.mock('../../composables/useArtistIndex.js', () => ({
  useArtistIndex: () => ({ state: artistIndexState }),
}));
vi.mock('../../composables/useAlbumNavigation.js', () => ({
  useAlbumNavigation: () => ({ jumpToArtist }),
}));

const { attachClientRender, findAll, mount, trigger } =
  await import('../ui/uiTestHost.js');
const { default: TrackArtistCredits } =
  await import('./TrackArtistCredits.vue');
const { default: UiTextButton } = await import('../ui/UiTextButton.vue');

function render(props) {
  return renderToString(
    createSSRApp({ render: () => h(TrackArtistCredits, props) }),
  );
}

beforeEach(() => {
  artistIndexState.index = {
    artists: [],
    trackArtistIds: {
      solo: ['artist-yoasobi'],
      duet: ['artist-yoasobi', 'artist-midories'],
    },
  };
});

describe('TrackArtistCredits', () => {
  it('links each credited artist with a named text action', async () => {
    const html = await render({
      track: { id: 'duet', artist: 'YOASOBI, ミドリーズ' },
    });
    expect(html).toContain('aria-label="前往藝人：YOASOBI"');
    expect(html).toContain('aria-label="前往藝人：ミドリーズ"');
    expect(html).toContain('track-artist-credits__separator');
  });

  it('announces navigation before opening the artist page', () => {
    attachClientRender(
      TrackArtistCredits,
      './TrackArtistCredits.vue',
      import.meta.url,
    );
    attachClientRender(UiTextButton, '../ui/UiTextButton.vue', import.meta.url);
    const calls = [];
    jumpToArtist.mockImplementation((id) => calls.push(`jump:${id}`));
    const { app, root } = mount(TrackArtistCredits, {
      track: { id: 'solo', artist: 'YOASOBI' },
      onNavigate: (id) => calls.push(`navigate:${id}`),
    });
    const link = findAll(
      root,
      (node) => node.props['aria-label'] === '前往藝人：YOASOBI',
    )[0];

    trigger(link, 'onClick', { stopPropagation: () => {} });

    expect(calls).toEqual(['navigate:artist-yoasobi', 'jump:artist-yoasobi']);
    app.unmount();
  });

  it('renders nothing for a track without artist text', async () => {
    const html = await render({ track: { id: 'solo', artist: '' } });
    expect(html).not.toContain('track-artist-credits');
  });

  it('falls back to the plain credit before the index loads or when parts cannot pair', async () => {
    artistIndexState.index = null;
    const loading = await render({ track: { id: 'solo', artist: 'YOASOBI' } });
    expect(loading).not.toContain('ui-text-btn');
    expect(loading).toContain('YOASOBI');

    artistIndexState.index = {
      artists: [],
      trackArtistIds: { duet: ['artist-yoasobi', 'artist-midories'] },
    };
    const unpaired = await render({
      track: { id: 'duet', artist: 'YOASOBI & ミドリーズ' },
    });
    expect(unpaired).not.toContain('ui-text-btn');
    expect(unpaired).toContain('YOASOBI &amp; ミドリーズ');
  });
});

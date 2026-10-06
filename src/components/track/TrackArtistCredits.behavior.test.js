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

const { default: TrackArtistCredits } =
  await import('./TrackArtistCredits.vue');

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

import { createSSRApp, h, reactive } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaylistSidebar from './PlaylistSidebar.vue';

const owners = vi.hoisted(() => ({ playlists: null, artists: null }));
vi.mock('../../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({
    state: owners.playlists,
    select: vi.fn(),
    selectArtist: vi.fn(),
    create: vi.fn(),
    reorderPlaylist: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('../../composables/useArtistIndex.js', () => ({
  useArtistIndex: () => ({
    state: owners.artists,
    ensureLoaded: vi.fn(),
    resolvePhotos: vi.fn(),
  }),
}));
vi.mock('../../composables/useCollectionPlayback.js', () => ({
  useCollectionPlayback: () => ({
    isActiveSource: () => false,
    isPlaying: () => false,
    togglePlayback: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  owners.playlists = reactive({
    playlists: [],
    isLoading: true,
    hasLoaded: false,
    selectedId: null,
    selectedArtistId: null,
    libraryView: 'all',
    error: null,
  });
  owners.artists = reactive({ index: null, isLoading: false });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const render = (props = {}) =>
  renderToString(createSSRApp({ render: () => h(PlaylistSidebar, props) }));

describe('Sidebar initial loading', () => {
  it('renders member artwork on the first loaded render without verifying release playback', async () => {
    owners.playlists.isLoading = false;
    owners.playlists.hasLoaded = true;
    owners.playlists.playlists = [
      {
        id: 'cold-album',
        name: 'Cold album',
        kind: 'album',
        trackIds: ['missing', 'track-a'],
        requiresMembershipVerification: true,
        availableTrackIds: [],
        resolvedRelease: { revision: 1 },
        releaseLibraryEpoch: 1,
      },
    ];
    const html = await render({
      tracksById: new Map([
        [
          'track-a',
          {
            id: 'track-a',
            title: 'Song',
            thumbnailUrl: 'utawakui-media://track/track-a/thumbnail.jpg',
          },
        ],
      ]),
    });
    expect(html).toContain(
      'src="utawakui-media://track/track-a/thumbnail.jpg"',
    );
    expect(html).not.toContain('playlist-sidebar__skeleton-row');
  });
  it('labels persistent Single releases without changing legacy album labels', async () => {
    owners.playlists.isLoading = false;
    owners.playlists.hasLoaded = true;
    owners.playlists.playlists = [
      {
        id: 'single',
        name: 'A Single',
        kind: 'album',
        trackIds: [],
        resolvedRelease: { type: 'single' },
      },
      { id: 'legacy', name: 'An Album', kind: 'album', trackIds: [] },
    ];
    const html = await render();
    expect(html).toContain('單曲');
    expect(html).toContain('專輯');
  });
  it('reserves collection rows while fixed navigation remains available, including compact mode', async () => {
    for (const compact of [false, true]) {
      const html = await render({ compact });
      expect(html).toContain('aria-label="全部曲目"');
      expect(html).toContain('aria-label="本機檔案"');
      expect(html).toContain('aria-busy="true"');
      expect(html.match(/playlist-sidebar__skeleton-row/g)).toHaveLength(6);
      expect(html).toContain('playlist-sidebar__skeleton--waiting');
      expect(html).not.toContain('沒有符合的集合');
    }
  });

  it('keeps loaded collections even when a refresh is pending', async () => {
    owners.playlists.playlists = [{ id: 'p1', name: 'Encore', trackIds: [] }];
    owners.playlists.hasLoaded = true;
    const html = await render();
    expect(html).toContain('Encore');
    expect(html).not.toContain('playlist-sidebar__skeleton-row');
  });

  it('settles empty results and failures without a permanent skeleton', async () => {
    owners.playlists.isLoading = false;
    expect(await render()).not.toContain('playlist-sidebar__skeleton-row');
    owners.playlists.error = '目前無法讀取播放清單，請再試一次。';
    const failed = await render();
    expect(failed).toContain('播放清單讀取未完成');
    expect(failed).toContain('重試');
    expect(failed).not.toContain('aria-busy="true"');
    const compactFailed = await render({ compact: true });
    expect(compactFailed).toContain('>重試讀取播放清單</span>');
    expect(compactFailed).not.toContain('ui-notice__action');
  });
});

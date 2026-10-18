import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, reactive, ref } from 'vue';
import { useAppView } from '../composables/useAppView.js';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../components/ui/uiTestHost.js';

const fixtures = vi.hoisted(() => ({
  player: null,
  queue: null,
  playlists: null,
  select: vi.fn(),
  selectArtist: vi.fn(),
  play: vi.fn(),
}));
vi.mock('../composables/usePlayer.js', () => ({
  usePlayer: () => ({
    state: fixtures.player,
    playTrack: fixtures.play,
    toggle: vi.fn(),
  }),
}));
vi.mock('../composables/usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({
    state: fixtures.queue,
    currentTrack: computed(() => fixtures.player.track),
    queuedTracks: ref([]),
    upcomingTracks: ref([]),
    setCurrentTrack: vi.fn(),
  }),
}));
vi.mock('../composables/useLibrary.js', () => ({
  useLibrary: () => ({ state: { tracks: [fixtures.player.track] } }),
}));
vi.mock('../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({
    state: fixtures.playlists,
    select: fixtures.select,
    selectArtist: fixtures.selectArtist,
    selectAlbumReference: vi.fn(),
  }),
}));
vi.mock('../composables/useArtistIndex.js', () => ({
  useArtistIndex: () => ({
    state: {
      index: {
        artists: [{ id: 'artist-singer', name: 'Singer', trackIds: ['song'] }],
        trackArtistIds: { song: ['artist-singer'] },
      },
    },
    ensureLoaded: vi.fn(),
  }),
}));
vi.mock('../composables/useLyrics.js', () => ({
  useLyrics: () => ({ lyricsTextVariant: ref('original') }),
}));
vi.mock('../composables/useCurrentTrackLyricsPreview.js', () => ({
  useCurrentTrackLyricsPreview: () => ({
    preview: ref(null),
    document: ref(null),
    isLoading: ref(false),
    error: ref(null),
  }),
}));
vi.mock('../components/playback/context/TrackContextPanel.vue', () => ({
  default: defineComponent({
    emits: ['openLyrics', 'openArtist', 'navigateSource', 'openQueue'],
    setup(_, { emit }) {
      return () =>
        h(
          'div',
          ['openLyrics', 'openArtist', 'navigateSource', 'openQueue'].map(
            (event) =>
              h(
                'button',
                { 'data-intent': event, onClick: () => emit(event) },
                event,
              ),
          ),
        );
    },
  }),
}));
import ContextView from './StudioLibraryContextView.vue';
attachClientRender(
  ContextView,
  './StudioLibraryContextView.vue',
  import.meta.url,
);

function click(root, intent) {
  trigger(
    findAll(root, (node) => node.props['data-intent'] === intent)[0],
    'onClick',
  );
}

describe('Metadata CTA navigation destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.player = reactive({
      track: { id: 'song', title: 'Song', artist: 'Singer' },
      isPlaying: true,
    });
    fixtures.queue = reactive({
      sourceId: 'collection',
      sourceName: 'Collection',
    });
    fixtures.playlists = reactive({
      playlists: [
        {
          id: 'collection',
          name: 'Collection',
          kind: 'playlist',
          trackIds: ['song'],
        },
      ],
    });
    useAppView().openLyricsAuthoring();
  });

  it('opens Performance live lyrics from authoring without changing playback', () => {
    const track = fixtures.player.track;
    const { app, root } = mount(ContextView);
    click(root, 'openLyrics');
    expect(useAppView().activeView.value).toBe('performance');
    expect(useAppView().performanceTool.value).toBe('live-lyrics');
    click(root, 'openLyrics');
    expect(useAppView().activeView.value).toBe('performance');
    expect(fixtures.player.track).toBe(track);
    expect(fixtures.player.isPlaying).toBe(true);
    expect(fixtures.play).not.toHaveBeenCalled();
    app.unmount();
  });

  it.each(['collection', 'artist-singer'])(
    'opens the actual source %s in Library browse',
    (sourceId) => {
      fixtures.queue.sourceId = sourceId;
      const { app, root } = mount(ContextView);
      click(root, 'navigateSource');
      expect(useAppView().activeView.value).toBe('library');
      expect(useAppView().libraryWorkspace.value).toBe('browse');
      expect(
        sourceId.startsWith('artist-')
          ? fixtures.selectArtist
          : fixtures.select,
      ).toHaveBeenCalledWith(sourceId);
      app.unmount();
    },
  );

  it('opens the indexed artist in Library browse', () => {
    const { app, root } = mount(ContextView);
    click(root, 'openArtist');
    expect(fixtures.selectArtist).toHaveBeenCalledWith('artist-singer');
    expect(useAppView().libraryWorkspace.value).toBe('browse');
    expect(useAppView().activeView.value).toBe('library');
    app.unmount();
  });

  it('does not navigate for a source without a local destination', () => {
    fixtures.queue.sourceId = 'lyrics-workspace';
    const { app, root } = mount(ContextView);
    click(root, 'navigateSource');
    expect(fixtures.select).not.toHaveBeenCalled();
    expect(fixtures.selectArtist).not.toHaveBeenCalled();
    expect(useAppView().libraryWorkspace.value).toBe('lyrics-authoring');
    app.unmount();
  });

  it('delegates open Queue to the shell without changing the workspace', () => {
    const onOpenQueue = vi.fn();
    const { app, root } = mount(ContextView, { onOpenQueue });
    click(root, 'openQueue');
    expect(onOpenQueue).toHaveBeenCalledOnce();
    expect(useAppView().libraryWorkspace.value).toBe('lyrics-authoring');
    app.unmount();
  });
});

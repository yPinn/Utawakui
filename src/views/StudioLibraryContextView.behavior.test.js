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
  lyrics: null,
  previewOptions: null,
  artistIndex: null,
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
    state: fixtures.artistIndex,
    ensureLoaded: vi.fn(),
  }),
}));
vi.mock('../composables/useLyrics.js', () => ({
  useLyrics: () => ({
    state: fixtures.lyrics,
    lyricsTextVariant: ref('original'),
  }),
}));
vi.mock('../composables/useCurrentTrackLyricsPreview.js', () => ({
  useCurrentTrackLyricsPreview: (options) => {
    fixtures.previewOptions = options;
    return {
      preview: ref(null),
      document: ref(null),
      isLoading: ref(false),
      error: ref(null),
    };
  },
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
    fixtures.artistIndex = reactive({
      index: {
        artists: [{ id: 'artist-singer', name: 'Singer', trackIds: ['song'] }],
        trackArtistIds: { song: ['artist-singer'] },
      },
    });
    fixtures.lyrics = reactive({
      selectedTrackId: 'song',
      selectedSourceFilename: 'song.lrc',
      isLoadingLyrics: false,
      offsetSeconds: 0,
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

  it('provides reactive source-scoped live offset and withholds the loading context', () => {
    const { app } = mount(ContextView);
    const { liveOffset } = fixtures.previewOptions;
    expect(liveOffset?.value).toEqual({
      trackId: 'song',
      sourceFilename: 'song.lrc',
      offsetMs: 0,
    });
    fixtures.lyrics.offsetSeconds = -0.1;
    expect(liveOffset.value.offsetMs).toBe(-100);
    fixtures.lyrics.isLoadingLyrics = true;
    expect(liveOffset.value).toBeNull();
    fixtures.lyrics.selectedTrackId = 'other';
    fixtures.lyrics.selectedSourceFilename = 'other.lrc';
    fixtures.lyrics.offsetSeconds = 0.2;
    fixtures.lyrics.isLoadingLyrics = false;
    expect(liveOffset.value).toEqual({
      trackId: 'other',
      sourceFilename: 'other.lrc',
      offsetMs: 200,
    });
    expect(fixtures.play).not.toHaveBeenCalled();
    app.unmount();
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

  it('opens the primary artist for a collaboration and preserves playback credits', () => {
    fixtures.player.track.artist = 'Singer, Guest';
    fixtures.artistIndex.index.artists.push({
      id: 'artist-guest',
      name: 'Guest',
      trackIds: ['song'],
    });
    fixtures.artistIndex.index.trackArtistIds.song = [
      'artist-singer',
      'artist-guest',
    ];
    const { app, root } = mount(ContextView);

    click(root, 'openArtist');

    expect(fixtures.selectArtist).toHaveBeenCalledExactlyOnceWith(
      'artist-singer',
    );
    expect(useAppView().activeView.value).toBe('library');
    expect(fixtures.player.track.artist).toBe('Singer, Guest');
    expect(fixtures.player.isPlaying).toBe(true);
    expect(fixtures.play).not.toHaveBeenCalled();
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

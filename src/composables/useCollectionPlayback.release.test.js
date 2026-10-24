import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  player: { isPlaying: false },
  queue: { sourceId: null, tracks: [], currentTrackId: null },
  collections: [],
  tracks: new Map(),
  play: vi.fn(),
  pause: vi.fn(),
  playTrack: vi.fn(),
  setQueue: vi.fn(),
  enqueueTrack: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('./usePlayer.js', () => ({
  usePlayer: () => ({
    state: mocks.player,
    play: mocks.play,
    pause: mocks.pause,
    playTrack: mocks.playTrack,
  }),
}));
vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({
    state: mocks.queue,
    setQueue: mocks.setQueue,
    enqueueTrack: mocks.enqueueTrack,
  }),
}));
vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({ tracksById: { value: mocks.tracks } }),
}));
vi.mock('./usePlaylists.js', () => ({
  usePlaylists: () => ({ state: { playlists: mocks.collections } }),
}));
vi.mock('./useReleaseMembers.js', () => ({
  useReleaseMembers: () => ({ resolve: mocks.resolve }),
}));
import { useCollectionPlayback } from './useCollectionPlayback.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.player.isPlaying = false;
  Object.assign(mocks.queue, {
    sourceId: null,
    tracks: [],
    currentTrackId: null,
  });
  mocks.collections.splice(0, Infinity, {
    id: 'r',
    name: 'Single',
    kind: 'album',
    releaseLibraryEpoch: 1,
    resolvedRelease: { revision: 2 },
    requiresMembershipVerification: true,
  });
  mocks.tracks.clear();
  mocks.tracks.set('a', { id: 'a', title: 'canonical' });
  mocks.resolve.mockResolvedValue([mocks.tracks.get('a')]);
});
describe('collection release admission at explicit actions', () => {
  it('plays a bound local release on the first click while its display projection is unverified', async () => {
    await useCollectionPlayback().togglePlayback({
      sourceId: 'r',
      sourceName: 'Single',
      tracks: [],
    });
    expect(mocks.resolve).toHaveBeenCalledWith(mocks.collections[0], {
      fresh: true,
    });
    expect(mocks.playTrack).toHaveBeenCalledWith(mocks.tracks.get('a'));
    expect(mocks.setQueue).toHaveBeenCalledWith([mocks.tracks.get('a')], 'a', {
      sourceId: 'r',
      sourceName: 'Single',
    });
  });
  it('enqueues canonical verified members on the first click', async () => {
    await useCollectionPlayback().enqueueCollection({
      sourceId: 'r',
      sourceName: 'Single',
      tracks: [],
    });
    expect(mocks.enqueueTrack).toHaveBeenCalledWith(mocks.tracks.get('a'));
    expect(mocks.playTrack).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'keeps existing active-source audio/queue authority when isPlaying=%s',
    async (playing) => {
      mocks.player.isPlaying = playing;
      mocks.queue.sourceId = 'r';
      mocks.queue.tracks = [mocks.tracks.get('a')];
      mocks.resolve.mockResolvedValue([]);
      await useCollectionPlayback().togglePlayback({
        sourceId: 'r',
        tracks: [],
      });
      expect(mocks.resolve).not.toHaveBeenCalled();
      expect(mocks.setQueue).not.toHaveBeenCalled();
      expect(playing ? mocks.pause : mocks.play).toHaveBeenCalledOnce();
    },
  );
  it('never plays a release that failed fresh admission', async () => {
    mocks.resolve.mockResolvedValue([]);
    await useCollectionPlayback().togglePlayback({
      sourceId: 'r',
      tracks: [mocks.tracks.get('a')],
    });
    expect(mocks.playTrack).not.toHaveBeenCalled();
    expect(mocks.setQueue).not.toHaveBeenCalled();
  });
  it('filters a complete display list through fresh admission on every play and queue action', async () => {
    const displayTracks = [
      mocks.tracks.get('a'),
      { id: 'changed', title: 'Saved reference' },
    ];
    const playback = useCollectionPlayback();
    await playback.togglePlayback({ sourceId: 'r', tracks: displayTracks });
    expect(mocks.setQueue).toHaveBeenCalledWith(
      [mocks.tracks.get('a')],
      'a',
      expect.objectContaining({ sourceId: 'r' }),
    );
    mocks.resolve.mockResolvedValue([]);
    await playback.enqueueCollection({ sourceId: 'r', tracks: displayTracks });
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    expect(
      mocks.resolve.mock.calls.every(([, options]) => options.fresh === true),
    ).toBe(true);
    expect(mocks.enqueueTrack).not.toHaveBeenCalled();
    expect(displayTracks).toHaveLength(2);
  });
  it('does not let an older different consumer steal playback after a newer intent', async () => {
    let finish;
    mocks.resolve.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const old = useCollectionPlayback().togglePlayback({
      sourceId: 'r',
      tracks: [],
    });
    await useCollectionPlayback().togglePlayback({
      sourceId: 'library:all',
      tracks: [{ id: 'other' }],
    });
    finish([mocks.tracks.get('a')]);
    await old;
    expect(mocks.playTrack.mock.calls).toEqual([[{ id: 'other' }]]);
  });
});

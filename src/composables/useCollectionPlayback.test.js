import { describe, expect, it, vi } from 'vitest';
import { createCollectionPlaybackController } from '../utils/collectionPlaybackController.js';

function createHarness({
  sourceId = null,
  isPlaying = false,
  isShuffle = false,
  random = () => 0,
} = {}) {
  const playerState = { isPlaying };
  const queueState = { sourceId, isShuffle };
  const calls = {
    play: vi.fn(),
    pause: vi.fn(),
    playTrack: vi.fn(),
    setQueue: vi.fn((tracks, currentTrackId, options) => {
      queueState.sourceId = options.sourceId;
      calls.lastQueue = { tracks, currentTrackId, options };
    }),
    enqueueTrack: vi.fn(),
  };
  const controller = createCollectionPlaybackController({
    playerState,
    queueState,
    ...calls,
    random,
  });
  return { controller, playerState, queueState, calls };
}

const tracks = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
  { id: 'c', title: 'C' },
];
const collection = {
  sourceId: 'collection-1',
  sourceName: 'Collection 1',
  tracks,
};

describe('collection playback controller', () => {
  it('pauses and resumes the active collection without rebuilding its queue', () => {
    const playing = createHarness({
      sourceId: collection.sourceId,
      isPlaying: true,
    });
    playing.controller.togglePlayback(collection);

    expect(playing.calls.pause).toHaveBeenCalledOnce();
    expect(playing.calls.setQueue).not.toHaveBeenCalled();

    const paused = createHarness({
      sourceId: collection.sourceId,
      isPlaying: false,
    });
    paused.controller.togglePlayback(collection);

    expect(paused.calls.play).toHaveBeenCalledOnce();
    expect(paused.calls.setQueue).not.toHaveBeenCalled();
  });

  it('loads the full supplied collection and starts its first track when inactive', () => {
    const { controller, calls } = createHarness({ sourceId: 'another-source' });

    controller.togglePlayback(collection);

    expect(calls.setQueue).toHaveBeenCalledWith(tracks, 'a', {
      sourceId: 'collection-1',
      sourceName: 'Collection 1',
    });
    expect(calls.playTrack).toHaveBeenCalledWith(tracks[0]);
  });

  it('plays an inactive collection from a random track when shuffle is already on', () => {
    const { controller, calls } = createHarness({
      sourceId: 'another-source',
      isShuffle: true,
      random: () => 0.5,
    });

    controller.togglePlayback(collection);

    expect(calls.setQueue).toHaveBeenCalledWith(tracks, 'b', {
      sourceId: 'collection-1',
      sourceName: 'Collection 1',
    });
    expect(calls.playTrack).toHaveBeenCalledWith(tracks[1]);
  });

  it('adds every valid member to the interrupt queue without changing playback', () => {
    const { controller, calls } = createHarness();

    controller.enqueueCollection({
      ...collection,
      tracks: [tracks[0], null, tracks[1]],
    });

    expect(calls.enqueueTrack.mock.calls).toEqual([[tracks[0]], [tracks[1]]]);
    expect(calls.setQueue).not.toHaveBeenCalled();
    expect(calls.playTrack).not.toHaveBeenCalled();
  });

  it('does nothing for an empty collection', () => {
    const { controller, calls } = createHarness();

    controller.togglePlayback({ ...collection, tracks: [] });
    controller.enqueueCollection({ ...collection, tracks: [] });

    expect(calls.play).not.toHaveBeenCalled();
    expect(calls.pause).not.toHaveBeenCalled();
    expect(calls.setQueue).not.toHaveBeenCalled();
    expect(calls.enqueueTrack).not.toHaveBeenCalled();
  });
});

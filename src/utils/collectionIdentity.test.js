import { expect, it, vi } from 'vitest';
import {
  collectionForSource,
  resolveCollectionSourceId,
} from './collectionIdentity.js';
import { createCollectionPlaybackController } from './collectionPlaybackController.js';
it('resolves retired source navigation and pauses/resumes without reloading a live or restored queue', () => {
  const collections = [
    { id: 'kept', redirectedIds: ['retired'], name: 'Album' },
  ];
  expect(collectionForSource(collections, 'retired').id).toBe('kept');
  expect(resolveCollectionSourceId(collections, 'artist:abc')).toBe(
    'artist:abc',
  );
  const queueState = {
    sourceId: 'retired',
    tracks: [{ id: 'b' }, { id: 'a' }],
    currentIndex: 1,
  };
  const playerState = { isPlaying: true, currentTime: 50 };
  const pause = vi.fn(),
    play = vi.fn(),
    setQueue = vi.fn(),
    playTrack = vi.fn();
  const controller = createCollectionPlaybackController({
    queueState,
    playerState,
    pause,
    play,
    setQueue,
    playTrack,
    enqueueTrack: vi.fn(),
    resolveSourceId: (id) => resolveCollectionSourceId(collections, id),
  });
  expect(controller.isActiveSource('kept')).toBe(true);
  controller.togglePlayback({ sourceId: 'kept', tracks: queueState.tracks });
  expect(pause).toHaveBeenCalledOnce();
  expect(setQueue).not.toHaveBeenCalled();
  expect(playTrack).not.toHaveBeenCalled();
  playerState.isPlaying = false;
  controller.togglePlayback({ sourceId: 'kept', tracks: queueState.tracks });
  expect(play).toHaveBeenCalledOnce();
  expect(queueState.tracks.map((t) => t.id)).toEqual(['b', 'a']);
  expect(playerState.currentTime).toBe(50);
});

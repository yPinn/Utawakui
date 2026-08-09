import { beforeEach, describe, expect, it, vi } from 'vitest';

const tracks = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
  { id: 'c', title: 'C' },
];

const interruptTracks = [
  { id: 'x', title: 'X' },
  { id: 'y', title: 'Y' },
];

beforeEach(() => {
  vi.resetModules();
});

async function loadQueue() {
  const { usePlaybackQueue } = await import('./usePlaybackQueue.js');
  return usePlaybackQueue();
}

describe('usePlaybackQueue', () => {
  it('stores a source queue snapshot with source metadata', async () => {
    const { state, currentTrack, sourceUpcomingTracks, setQueue } =
      await loadQueue();

    setQueue(tracks, 'b', { sourceName: 'playlist #1' });

    expect(state.sourceName).toBe('playlist #1');
    expect(state.currentTrackId).toBe('b');
    expect(currentTrack.value).toEqual({ id: 'b', title: 'B' });
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual(['c']);
  });

  it('falls back to the first source track when the requested current track is absent', async () => {
    const { state, setQueue } = await loadQueue();

    setQueue(tracks, 'missing');

    expect(state.currentTrackId).toBe('a');
  });

  it('dedupes invalid or repeated source entries', async () => {
    const { state, setQueue } = await loadQueue();

    setQueue([
      tracks[0],
      null,
      tracks[0],
      { id: '', title: 'Nope' },
      tracks[1],
    ]);

    expect(state.tracks.map((track) => track.id)).toEqual(['a', 'b']);
  });

  it('moves previous and next through the source order', async () => {
    const {
      state,
      canGoPrevious,
      canGoNext,
      setQueue,
      previousTrack,
      nextTrack,
    } = await loadQueue();

    setQueue(tracks, 'b');

    expect(canGoPrevious.value).toBe(false);
    expect(canGoNext.value).toBe(true);
    expect(nextTrack()?.id).toBe('c');
    expect(state.currentTrackId).toBe('c');
    expect(canGoNext.value).toBe(false);
    expect(previousTrack()?.id).toBe('b');
    expect(canGoPrevious.value).toBe(false);
  });

  it('does not add history when nextTrack has no next track', async () => {
    const { state, canGoNext, setQueue, nextTrack, previousTrack } =
      await loadQueue();

    setQueue(tracks, 'a');
    expect(nextTrack()?.id).toBe('b');
    expect(nextTrack()?.id).toBe('c');
    expect(canGoNext.value).toBe(false);

    expect(nextTrack()).toBe(null);

    expect(state.currentTrackId).toBe('c');
    expect(state.historyEntries.map((entry) => entry.track.id)).toEqual([
      'a',
      'b',
    ]);
    expect(previousTrack()?.id).toBe('b');
  });

  it('keeps the current source track when previous is requested at the start', async () => {
    const { state, canGoPrevious, setQueue, previousTrack } = await loadQueue();

    setQueue(tracks, 'a', { sourceName: 'playlist #1' });

    expect(canGoPrevious.value).toBe(false);
    expect(previousTrack()).toBe(null);
    expect(state.currentTrackId).toBe('a');
  });

  it('plays interrupt queued tracks before resuming the source order', async () => {
    const {
      state,
      queuedTracks,
      sourceUpcomingTracks,
      setQueue,
      enqueueTrack,
      nextTrack,
    } = await loadQueue();

    setQueue(tracks, 'a', { sourceName: 'playlist #1' });
    enqueueTrack(interruptTracks[0]);
    enqueueTrack(interruptTracks[1]);

    expect(queuedTracks.value.map((track) => track.id)).toEqual(['x', 'y']);
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual([
      'b',
      'c',
    ]);
    expect(nextTrack()?.id).toBe('x');
    expect(nextTrack()?.id).toBe('y');
    expect(nextTrack()?.id).toBe('b');
    expect(state.currentTrackId).toBe('b');
  });

  it('does not remove the same song from the source order when queued as an interrupt', async () => {
    const {
      queuedTracks,
      sourceUpcomingTracks,
      setQueue,
      enqueueTrack,
      nextTrack,
    } = await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(tracks[1]);

    expect(queuedTracks.value.map((track) => track.id)).toEqual(['b']);
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual([
      'b',
      'c',
    ]);
    expect(nextTrack()?.id).toBe('b');
    expect(nextTrack()?.id).toBe('b');
  });

  it('does not queue the current track or duplicate interrupt entries', async () => {
    const { state, setQueue, enqueueTrack } = await loadQueue();

    setQueue(tracks, 'a');

    expect(enqueueTrack(tracks[0])).toBe(null);
    expect(enqueueTrack(interruptTracks[0])).toEqual(interruptTracks[0]);
    expect(enqueueTrack({ id: 'x', title: 'X copy' })).toBe(null);
    expect(state.queuedTracks.map((track) => track.id)).toEqual(['x']);
  });

  it('clears only interrupt queued tracks', async () => {
    const {
      state,
      sourceUpcomingTracks,
      setQueue,
      enqueueTrack,
      clearQueuedTracks,
    } = await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);
    clearQueuedTracks();

    expect(state.queuedTracks).toEqual([]);
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('reorders interrupt queued tracks without changing source order', async () => {
    const {
      state,
      sourceUpcomingTracks,
      setQueue,
      enqueueTrack,
      reorderQueuedTrack,
    } = await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);
    enqueueTrack(interruptTracks[1]);

    expect(reorderQueuedTrack('y', 'x', 'before')).toBe(true);
    expect(state.queuedTracks.map((track) => track.id)).toEqual(['y', 'x']);
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('ignores reorder requests outside the interrupt queue', async () => {
    const { state, setQueue, enqueueTrack, reorderQueuedTrack } =
      await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);

    expect(reorderQueuedTrack('a', 'x', 'after')).toBe(false);
    expect(reorderQueuedTrack('x', 'b', 'after')).toBe(false);
    expect(state.queuedTracks.map((track) => track.id)).toEqual(['x']);
  });

  it('reorders source upcoming tracks as temporary playback order', async () => {
    const {
      state,
      sourceUpcomingTracks,
      setQueue,
      reorderSourceTrack,
      nextTrack,
    } = await loadQueue();

    setQueue(tracks, 'a', { sourceName: 'playlist #1' });

    expect(reorderSourceTrack('c', 'b', 'before')).toBe(true);
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual([
      'c',
      'b',
    ]);
    expect(state.tracks.map((track) => track.id)).toEqual(['a', 'b', 'c']);
    expect(nextTrack()?.id).toBe('c');
  });

  it('does not reorder the current source track from the queue panel', async () => {
    const { state, sourceUpcomingTracks, setQueue, reorderSourceTrack } =
      await loadQueue();

    setQueue(tracks, 'a');

    expect(reorderSourceTrack('a', 'b', 'after')).toBe(false);
    expect(reorderSourceTrack('b', 'a', 'before')).toBe(false);
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual([
      'b',
      'c',
    ]);
    expect(state.currentTrackId).toBe('a');
  });

  it('restarts the source order for list repeat', async () => {
    const { state, setQueue, nextTrack, restartSourceQueue } =
      await loadQueue();

    setQueue(tracks, 'a');
    nextTrack();
    nextTrack();

    expect(state.currentTrackId).toBe('c');
    expect(restartSourceQueue()?.id).toBe('a');
    expect(state.currentTrackId).toBe('a');
  });

  it('restores an interrupt track when stepping back to the source track', async () => {
    const { state, setQueue, enqueueTrack, nextTrack, previousTrack } =
      await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);
    nextTrack();

    expect(previousTrack()?.id).toBe('a');
    expect(state.queuedTracks.map((track) => track.id)).toEqual(['x']);
    expect(nextTrack()?.id).toBe('x');
  });

  it('creates a shuffled source order without rewriting interrupt queue order', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    const {
      state,
      queuedTracks,
      sourceUpcomingTracks,
      setQueue,
      enqueueTrack,
      toggleShuffle,
      nextTrack,
    } = await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);
    toggleShuffle();

    expect(state.isShuffle).toBe(true);
    expect(state.tracks.map((track) => track.id)).toEqual(['a', 'b', 'c']);
    expect(queuedTracks.value.map((track) => track.id)).toEqual(['x']);
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual([
      'c',
      'b',
    ]);
    expect(nextTrack()?.id).toBe('x');
    expect(nextTrack()?.id).toBe('c');
  });

  it('keeps the current source track when shuffle is toggled off', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    const { state, setQueue, toggleShuffle, nextTrack } = await loadQueue();

    setQueue(tracks, 'a');
    toggleShuffle();
    nextTrack();
    toggleShuffle();

    expect(state.isShuffle).toBe(false);
    expect(state.currentTrackId).toBe('c');
  });

  it('refreshes the current source track object when setQueue receives newer metadata', async () => {
    const { state, currentTrack, setQueue } = await loadQueue();

    setQueue([{ id: 'a', title: 'Old title' }], 'a');
    setQueue([{ id: 'a', title: 'New title', hasSeparation: true }], 'a');

    expect(state.currentTrack).toEqual({
      id: 'a',
      title: 'New title',
      hasSeparation: true,
    });
    expect(currentTrack.value).toEqual({
      id: 'a',
      title: 'New title',
      hasSeparation: true,
    });
  });

  it('removes a deleted track from source, interrupt queue, history, and current state', async () => {
    const { state, setQueue, enqueueTrack, nextTrack, removeTrack } =
      await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);
    nextTrack();
    enqueueTrack(interruptTracks[1]);

    expect(removeTrack('x')).toBe(true);

    expect(state.currentTrackId).toBe(null);
    expect(state.currentTrack).toBe(null);
    expect(state.historyEntries.map((entry) => entry.track.id)).toEqual(['a']);
    expect(state.queuedTracks.map((track) => track.id)).toEqual(['y']);

    expect(removeTrack('a')).toBe(true);
    expect(removeTrack('y')).toBe(true);

    expect(state.tracks.map((track) => track.id)).toEqual(['b', 'c']);
    expect(state.queuedTracks.map((track) => track.id)).toEqual([]);
    expect(state.historyEntries).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('./usePlaybackQueue.js', import.meta.url),
  'utf8',
);

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
  it('builds one deterministic track index for Queue projections', async () => {
    const { buildQueueTrackIndex } = await import('./usePlaybackQueue.js');
    const current = { id: 'shared', title: 'current' };
    const firstHistory = { id: 'history', title: 'first history' };
    const index = buildQueueTrackIndex({
      currentTrack: current,
      historyEntries: [
        { track: firstHistory },
        { track: { id: 'history', title: 'later history' } },
      ],
      tracks: [
        { id: 'source', title: 'source' },
        { id: 'shared', title: 'source wins current' },
      ],
      queuedTracks: [{ id: 'shared', title: 'queued wins all' }],
    });

    expect(index.get('history')).toBe(firstHistory);
    expect(index.get('source')?.title).toBe('source');
    expect(index.get('shared')?.title).toBe('queued wins all');
    expect(source).toContain('const trackIndex = computed');
    expect(source).toContain('trackIndex.value.get(trackId)');
    expect(source).not.toContain('upcomingIds.map(trackById)');
  });

  it('stores a source queue snapshot with source metadata', async () => {
    const { state, currentTrack, sourceUpcomingTracks, setQueue } =
      await loadQueue();

    setQueue(tracks, 'b', { sourceName: 'playlist #1', sourceId: 'p1' });

    expect(state.sourceName).toBe('playlist #1');
    expect(state.sourceId).toBe('p1');
    expect(state.currentTrackId).toBe('b');
    expect(currentTrack.value).toEqual({ id: 'b', title: 'B' });
    expect(sourceUpcomingTracks.value.map((track) => track.id)).toEqual(['c']);
  });

  it('defaults sourceId to null when not given, and rejects a non-string value', async () => {
    const { state, setQueue } = await loadQueue();

    setQueue(tracks, 'a');
    expect(state.sourceId).toBe(null);

    setQueue(tracks, 'a', { sourceId: 42 });
    expect(state.sourceId).toBe(null);
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

  it('reports no change when a reorder would leave the interrupt queue in the same order', async () => {
    const { state, setQueue, enqueueTrack, reorderQueuedTrack } =
      await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);
    enqueueTrack(interruptTracks[1]);

    // 'x' is already immediately before 'y' — "move x before y" is a no-op.
    expect(reorderQueuedTrack('x', 'y', 'before')).toBe(false);
    expect(state.queuedTracks.map((track) => track.id)).toEqual(['x', 'y']);
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

  it('refuses to reorder a source track that has already been played past', async () => {
    const { setQueue, nextTrack, reorderSourceTrack } = await loadQueue();

    setQueue(tracks, 'a');
    nextTrack(); // current is now 'b'; 'a' has been played past

    // Both 'a' and 'c' are valid source tracks and neither is current, but
    // 'a' is behind the playback cursor and therefore not movable.
    expect(reorderSourceTrack('a', 'c', 'before')).toBe(false);
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

  it('setCurrentTrack: does nothing when the requested track cannot be found anywhere', async () => {
    const { state, setQueue, setCurrentTrack } = await loadQueue();

    setQueue(tracks, 'a');
    setCurrentTrack('does-not-exist');

    expect(state.currentTrackId).toBe('a');
  });

  it('setCurrentTrack: with source:true selects strictly from the source list, ignoring the interrupt queue', async () => {
    const { state, setQueue, enqueueTrack, setCurrentTrack } =
      await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);

    // Not in state.tracks at all, so the strict lookup must miss even
    // though trackById() would have found it in the interrupt queue.
    setCurrentTrack('x', { source: true });
    expect(state.currentTrackId).toBe('a');

    setCurrentTrack('c', { source: true });
    expect(state.currentTrackId).toBe('c');
    expect(state.currentIsSource).toBe(true);
    // Selecting directly from the source list must not touch the
    // interrupt queue.
    expect(state.queuedTracks.map((track) => track.id)).toEqual(['x']);
  });

  it('setCurrentTrack: selecting a queued (interrupt) track consumes it out of the queue and is not treated as a source track', async () => {
    const { state, setQueue, enqueueTrack, setCurrentTrack } =
      await loadQueue();

    setQueue(tracks, 'a');
    enqueueTrack(interruptTracks[0]);
    enqueueTrack(interruptTracks[1]);

    setCurrentTrack('x');

    expect(state.currentTrackId).toBe('x');
    expect(state.currentIsSource).toBe(false);
    expect(state.queuedTracks.map((track) => track.id)).toEqual(['y']);
  });

  it('setCurrentTrack: selecting a source-list track without source:true still counts as a source track when not queued', async () => {
    const { state, setQueue, setCurrentTrack } = await loadQueue();

    setQueue(tracks, 'a');
    setCurrentTrack('c');

    expect(state.currentTrackId).toBe('c');
    expect(state.currentIsSource).toBe(true);
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

    // Already gone from everywhere (source, queue, history, current) —
    // removing it again is a clean no-op, not an error.
    expect(removeTrack('x')).toBe(false);
  });
});

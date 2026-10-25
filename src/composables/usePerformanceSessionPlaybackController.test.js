import { reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePerformanceSessionPlaybackController } from './usePerformanceSessionPlaybackController.js';

const controllers = [];
afterEach(() =>
  controllers.splice(0).forEach((controller) => controller.dispose()),
);
function harness() {
  const items = [1, 2, 3].map((n) => ({
    itemId: `i${n}`,
    trackId: 'song',
    mode: 'library-track',
    displayTitle: `Song ${n}`,
    ready: true,
    progress: 'queued',
    progressRevision: 0,
  }));
  const state = reactive({ plan: { items }, error: null });
  const plan = {
    state,
    initialize: vi.fn(),
    setProgress: vi.fn(async (id, progress) => {
      const item = state.plan.items.find((item) => item.itemId === id);
      item.progress = progress;
      item.progressRevision++;
      return true;
    }),
  };
  const listeners = {};
  const player = {
    state: reactive({
      track: null,
      playbackRevision: 0,
      playbackPhase: 'idle',
    }),
    onPlaying: (callback) => {
      listeners.playing = callback;
      return vi.fn();
    },
    onStopped: (callback) => {
      listeners.stopped = callback;
      return vi.fn();
    },
    cancelPendingStart: vi.fn(),
    pause: vi.fn(),
    clearTrack: vi.fn(),
    restartTrack: vi.fn(),
    playTrack: vi.fn(async (track) => {
      player.state.track = track;
      player.state.playbackRevision++;
      return true;
    }),
  };
  const queue = { interruptWithTrack: vi.fn() };
  const tracks = [
    { id: 'song', url: 'utawakui-media://song/audio', thumbnailUrl: 'cover' },
  ];
  const controller = usePerformanceSessionPlaybackController({
    plan,
    player,
    queue,
    getTracks: () => tracks,
    toPlayableTrack: (track) => track,
  });
  controllers.push(controller);
  const event = () => ({
    trackId: 'song',
    playbackRevision: player.state.playbackRevision,
  });
  const playing = async () => {
    await listeners.playing(event());
    await controller.settled();
  };
  return { controller, plan, player, listeners, event, playing, queue, tracks };
}

describe('arrangement playback uses local audio without any OBS dependency', () => {
  it('does not consume ordinary queued songs when starting a performance occurrence', async () => {
    const h = harness();
    await h.controller.start('i1');
    expect(h.queue.interruptWithTrack).toHaveBeenCalledWith(h.tracks[0], {
      preserveQueue: true,
    });
  });
  it('replays a completed result as a new occurrence without rewriting the result', async () => {
    const h = harness();
    h.plan.state.plan.items[0].progress = 'completed';
    h.plan.duplicateItemForPlayback = vi.fn(async () => {
      h.plan.state.plan.items.push({
        ...h.plan.state.plan.items[0],
        itemId: 'replay',
        progress: 'queued',
        progressRevision: 0,
      });
      return 'replay';
    });
    expect(await h.controller.replay('i1')).toBe(true);
    await h.playing();
    expect(h.plan.state.plan.items[0].progress).toBe('completed');
    expect(h.controller.currentItem.value.itemId).toBe('replay');
    expect(h.plan.setProgress).toHaveBeenCalledWith('replay', 'playing');
  });
  it('does not replay unavailable or non-completed entries or a failed duplication', async () => {
    const h = harness();
    h.plan.duplicateItemForPlayback = vi.fn(async () => null);
    expect(await h.controller.replay('i1')).toBe(false);
    h.plan.state.plan.items[0].progress = 'completed';
    h.plan.state.plan.items[0].ready = false;
    expect(await h.controller.replay('i1')).toBe(false);
    expect(h.plan.duplicateItemForPlayback).not.toHaveBeenCalled();
    h.plan.state.plan.items[0].ready = true;
    expect(await h.controller.replay('i1')).toBe(false);
    expect(h.player.playTrack).not.toHaveBeenCalled();
  });
  it('shows accumulating queued and result projections and preserves result order', async () => {
    const h = harness();
    expect(h.controller.canStart.value).toBe(true);
    expect(h.controller.canNext.value).toBe(false);
    await h.controller.start('i1');
    await h.playing();
    expect(h.controller.canNext.value).toBe(true);
    h.controller.previous();
    expect(h.player.restartTrack).toHaveBeenCalledOnce();
    h.controller.setContinuous(false);
    await h.controller.complete();
    await h.controller.skip('i2');
    h.plan.state.plan.items[0].progressUpdatedAt = '2026-10-19T01:00:00Z';
    h.plan.state.plan.items[1].progressUpdatedAt = '2026-10-19T02:00:00Z';
    expect(h.controller.pendingItems.value.map((item) => item.itemId)).toEqual([
      'i3',
    ]);
    expect(
      h.controller.historyItems.value.map((item) => item.progress),
    ).toEqual(['completed', 'skipped']);
  });

  it('handles missing, unavailable and already finished items without touching audio', async () => {
    const h = harness();
    expect(await h.controller.start('missing')).toBe(false);
    h.plan.state.plan.items[0].ready = false;
    expect(await h.controller.start('i1')).toBe(false);
    h.plan.state.plan.items[1].progress = 'completed';
    expect(await h.controller.start('i2')).toBe(false);
    h.tracks[0].url = null;
    expect(await h.controller.start('i3')).toBe(false);
    expect(h.player.playTrack).not.toHaveBeenCalled();
    expect(h.controller.state.error).toContain('音檔');
  });

  it('keeps the last current song playing when a media next command has no target', async () => {
    const h = harness();
    await h.controller.start('i1');
    await h.playing();
    h.plan.state.plan.items.slice(1).forEach((item) => {
      item.ready = false;
    });
    expect(h.controller.canNext.value).toBe(false);
    expect(await h.controller.next()).toBe(false);
    expect(h.controller.currentItem.value.itemId).toBe('i1');
    expect(h.player.pause).not.toHaveBeenCalled();
  });

  it('retains current progress on failed completion persistence and allows stop recovery', async () => {
    const h = harness();
    await h.controller.start('i1');
    await h.playing();
    h.plan.setProgress.mockResolvedValueOnce(false);
    expect(await h.controller.complete()).toBe(false);
    expect(h.plan.state.plan.items[0].progress).toBe('playing');
    expect(h.player.playTrack).toHaveBeenCalledTimes(1);
    await h.controller.stop();
    expect(h.plan.state.plan.items[0].progress).toBe('interrupted');
  });

  it('records real mid-play errors as interruption and ignores stale stop events', async () => {
    const h = harness();
    await h.controller.start('i1');
    await h.playing();
    h.listeners.stopped({
      trackId: 'song',
      playbackRevision: 0,
      reason: 'error',
    });
    expect(h.controller.currentItem.value).not.toBeNull();
    h.listeners.stopped({ ...h.event(), reason: 'error' });
    await h.controller.settled();
    expect(h.plan.state.plan.items[0].progress).toBe('interrupted');
    expect(h.controller.state.error).toContain('播放中斷');
    expect(h.player.playTrack).toHaveBeenCalledTimes(1);
  });

  it('rejects pre-start revision changes and keeps the item queued for retry', async () => {
    const h = harness();
    await h.controller.start('i1');
    h.plan.state.plan.items[0].revision = 99;
    await h.playing();
    expect(h.player.pause).toHaveBeenCalled();
    expect(h.plan.state.plan.items[0].progress).toBe('queued');
    expect(h.controller.currentItem.value).toBeNull();
  });

  it('keeps a failed manual start out of current and bounds unexpected action errors', async () => {
    const h = harness();
    h.plan.state.plan.items[0].mode = 'manual';
    h.plan.setProgress.mockResolvedValueOnce(false);
    expect(await h.controller.start('i1')).toBe(false);
    expect(h.controller.currentItem.value).toBeNull();
    h.plan.setProgress.mockRejectedValueOnce(new Error('private diagnostics'));
    expect(await h.controller.skip('i2')).toBe(false);
    expect(h.controller.state.error).not.toContain('private');
    h.controller.dispose();
    expect(await h.controller.start('i3')).toBe(false);
  });
  it('waits for playing, retains paused ownership and completes only the matching ended event', async () => {
    const h = harness();
    await h.controller.start('i1');
    expect(h.plan.state.plan.items[0].progress).toBe('queued');
    await h.playing();
    expect(h.plan.state.plan.items[0].progress).toBe('playing');
    h.player.state.playbackPhase = 'paused';
    expect(h.controller.currentItem.value.itemId).toBe('i1');
    expect(
      h.controller.handleEnded({ trackId: 'song', playbackRevision: 0 }),
    ).toBe(false);
    h.controller.setContinuous(false);
    expect(h.controller.handleEnded(h.event())).toBe(true);
    await h.controller.settled();
    expect(h.plan.state.plan.items[0].progress).toBe('completed');
    expect(h.player.playTrack).toHaveBeenCalledTimes(1);
  });

  it('advances occurrences of the same song, ignores stale events and never starts twice', async () => {
    const h = harness();
    await h.controller.start('i1');
    await h.playing();
    const first = h.event();
    h.controller.handleEnded(first);
    h.controller.handleEnded(first);
    await h.controller.settled();
    expect(h.controller.currentItem.value.itemId).toBe('i2');
    expect(h.player.playTrack).toHaveBeenCalledTimes(2);
    expect(h.controller.handleEnded(first)).toBe(false);
    await h.playing();
    expect(h.plan.state.plan.items.map((item) => item.progress)).toEqual([
      'completed',
      'playing',
      'queued',
    ]);
  });

  it('marks an early next as interrupted, and supports manual start and completion', async () => {
    const h = harness();
    h.plan.state.plan.items[1].mode = 'manual';
    h.plan.state.plan.items[1].trackId = null;
    await h.controller.start('i1');
    await h.playing();
    await h.controller.next();
    expect(h.plan.state.plan.items[0].progress).toBe('interrupted');
    expect(h.controller.currentItem.value.mode).toBe('manual');
    h.controller.setContinuous(false);
    await h.controller.complete();
    expect(h.plan.state.plan.items[1].progress).toBe('completed');
    expect(h.player.playTrack).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed start queued and does not auto advance', async () => {
    const h = harness();
    h.player.playTrack.mockResolvedValue(false);
    await h.controller.start('i1');
    expect(h.plan.state.plan.items[0].progress).toBe('queued');
    expect(h.controller.currentItem.value).toBe(null);
    expect(h.player.playTrack).toHaveBeenCalledTimes(1);
  });

  it('releases ownership on external playback, including the same canonical track', async () => {
    const h = harness();
    await h.controller.start('i1');
    await h.playing();
    h.player.state.track = { id: 'song', url: 'external' };
    h.player.state.playbackRevision++;
    await h.controller.settled();
    expect(h.plan.state.plan.items[0].progress).toBe('interrupted');
    expect(h.controller.ownsPlayback.value).toBe(false);
    expect(h.controller.handleEnded(h.event())).toBe(false);
  });

  it('never keeps a manual NP beside newly started local audio', async () => {
    const h = harness();
    h.plan.state.plan.items[0].mode = 'manual';
    h.plan.state.plan.items[0].trackId = null;
    await h.controller.start('i1');
    h.player.state.track = { id: 'song' };
    await h.controller.settled();
    expect(h.controller.currentItem.value).toBeNull();
    expect(h.plan.state.plan.items[0].progress).toBe('interrupted');
    expect(h.controller.ownsPlayback.value).toBe(false);
  });

  it('waits for pending confirmed-start persistence before saving completion', async () => {
    const h = harness();
    let resolve;
    const initial = h.plan.setProgress.getMockImplementation();
    h.plan.setProgress.mockImplementationOnce(async (...args) => {
      await new Promise((r) => {
        resolve = r;
      });
      return initial(...args);
    });
    await h.controller.start('i1');
    const confirming = h.listeners.playing(h.event());
    h.controller.setContinuous(false);
    h.controller.handleEnded(h.event());
    await Promise.resolve();
    expect(h.plan.setProgress).toHaveBeenCalledTimes(1);
    resolve();
    await confirming;
    await h.controller.settled();
    expect(h.plan.state.plan.items[0].progress).toBe('completed');
  });

  it('does not consume unrelated playback after the arrangement has finished', async () => {
    const h = harness();
    await h.controller.start('i1');
    await h.playing();
    h.controller.setContinuous(false);
    h.controller.handleEnded(h.event());
    await h.controller.settled();
    h.player.state.track = { id: 'external' };
    expect(h.controller.ownsPlayback.value).toBe(false);
  });

  it('can stop and retry after confirmed-start persistence fails', async () => {
    const h = harness();
    h.plan.setProgress.mockResolvedValueOnce(false);
    await h.controller.start('i1');
    await h.playing();
    await h.controller.stop();
    expect(h.controller.currentItem.value).toBeNull();
    expect(h.plan.state.plan.items[0].progress).toBe('queued');
    await h.controller.start('i1');
    await h.playing();
    expect(h.plan.state.plan.items[0].progress).toBe('playing');
  });

  it('does not auto advance an ended item that was never confirmed playing', async () => {
    const h = harness();
    await h.controller.start('i1');
    expect(h.controller.handleEnded(h.event())).toBe(true);
    await h.controller.settled();
    expect(h.plan.state.plan.items[0].progress).toBe('queued');
    expect(h.player.playTrack).toHaveBeenCalledTimes(1);
  });

  it('keeps a confirmed occurrence alive when its order or labels change before resume', async () => {
    const h = harness();
    await h.controller.start('i1');
    await h.playing();
    h.plan.state.plan.items[0].revision = 2;
    h.plan.state.plan.items[0].displayTitle = 'Changed after start';
    await h.playing();
    expect(h.controller.currentItem.value.displayTitle).toBe('Song 1');
    expect(h.plan.state.plan.items[0].progress).toBe('playing');
    expect(h.plan.setProgress).toHaveBeenCalledTimes(1);
  });

  it('can cancel a pending audio start immediately instead of waiting behind it', async () => {
    const h = harness();
    let resolve;
    h.player.playTrack.mockImplementation(async (track) => {
      h.player.state.track = track;
      h.player.state.playbackRevision++;
      return new Promise((r) => {
        resolve = r;
      });
    });
    h.player.clearTrack.mockImplementation(() => resolve(false));
    const starting = h.controller.start('i1');
    await Promise.resolve();
    const stopping = h.controller.stop();
    expect(h.player.clearTrack).toHaveBeenCalledOnce();
    await Promise.all([starting, stopping]);
    expect(h.controller.currentItem.value).toBeNull();
    expect(h.plan.state.plan.items[0].progress).toBe('queued');
    expect(h.controller.state.error).toBeNull();
  });
});

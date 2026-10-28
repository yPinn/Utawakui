import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const player = vi.hoisted(() => ({
  playTrack: vi.fn(),
  restartTrack: vi.fn(),
  state: { playbackMode: 'sequence', track: null, playbackRevision: 0 },
}));
const queue = vi.hoisted(() => ({
  previousTrack: vi.fn(),
  nextTrack: vi.fn(),
  restartSourceQueue: vi.fn(),
  canGoNext: { value: false },
}));
const toPlayableTrack = vi.hoisted(() =>
  vi.fn((track) => ({ ...track, playable: true })),
);

vi.mock('./usePlayer.js', () => ({ usePlayer: () => player }));
vi.mock('./usePlaybackQueue.js', () => ({ usePlaybackQueue: () => queue }));
vi.mock('../utils/playableTrack.js', () => ({ toPlayableTrack }));

import {
  registerPlaybackArrangement,
  usePlaybackTransport,
} from './usePlaybackTransport.js';
let unregister;
afterEach(() => {
  unregister?.();
  unregister = null;
});

beforeEach(() => {
  for (const mock of [
    player.playTrack,
    player.restartTrack,
    queue.previousTrack,
    queue.nextTrack,
    toPlayableTrack,
  ]) {
    mock.mockClear();
  }
  queue.previousTrack.mockReturnValue(null);
  queue.nextTrack.mockReturnValue(null);
  queue.restartSourceQueue.mockReset();
  player.state.track = null;
  player.state.playbackMode = 'sequence';
});

describe('usePlaybackTransport', () => {
  it('returns the existing player completion for ordinary previous and next', async () => {
    player.playTrack.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    queue.nextTrack.mockReturnValue({ id: 'next' });
    queue.previousTrack.mockReturnValue({ id: 'previous' });
    const transport = usePlaybackTransport();
    expect(await transport.playNext()).toBe(false);
    expect(await transport.playPrevious()).toBe(true);
  });
  it('uses one arrangement owner for PlayerBar, media keys and ended without advancing the ordinary queue', () => {
    const arrangement = {
      ownsPlayback: { value: true },
      canNext: { value: true },
      next: vi.fn(),
      previous: vi.fn(),
      handleEnded: vi.fn(() => true),
    };
    unregister = registerPlaybackArrangement(arrangement);
    const transport = usePlaybackTransport();
    expect(transport.canPlayNext.value).toBe(true);
    transport.playNext();
    transport.playPrevious();
    transport.playAfterEnded({ trackId: 'song', playbackRevision: 1 });
    expect(arrangement.next).toHaveBeenCalledOnce();
    expect(arrangement.previous).toHaveBeenCalledOnce();
    expect(arrangement.handleEnded).toHaveBeenCalledOnce();
    expect(queue.nextTrack).not.toHaveBeenCalled();
    arrangement.handleEnded.mockReturnValue(false);
    transport.playAfterEnded({ trackId: 'song', playbackRevision: 1 });
    expect(queue.nextTrack).not.toHaveBeenCalled();
  });

  it('retains ordinary repeat-list behavior when no arrangement owns transport', () => {
    player.state.playbackMode = 'repeat-list';
    queue.restartSourceQueue.mockReturnValue({ id: 'first' });
    usePlaybackTransport().playAfterEnded(null);
    expect(player.playTrack).toHaveBeenCalledWith({
      id: 'first',
      playable: true,
    });
  });

  it('ignores stale ended events before selecting an ordinary next track', () => {
    player.state.track = { id: 'new' };
    player.state.playbackRevision = 2;
    usePlaybackTransport().playAfterEnded({
      trackId: 'old',
      playbackRevision: 1,
    });
    expect(queue.nextTrack).not.toHaveBeenCalled();
  });
  it('plays a queued track through the playable-track projection', () => {
    usePlaybackTransport().playQueuedTrack({ id: 'a' });

    expect(player.playTrack).toHaveBeenCalledWith({ id: 'a', playable: true });
  });

  it('ignores an empty queue result', () => {
    usePlaybackTransport().playQueuedTrack(null);

    expect(player.playTrack).not.toHaveBeenCalled();
  });

  it('plays the next queued track', () => {
    queue.nextTrack.mockReturnValue({ id: 'next' });

    usePlaybackTransport().playNext();

    expect(player.playTrack).toHaveBeenCalledWith({
      id: 'next',
      playable: true,
    });
  });

  it('does nothing when there is no next track', () => {
    usePlaybackTransport().playNext();

    expect(player.playTrack).not.toHaveBeenCalled();
  });

  it('plays the previous track when history has one', () => {
    queue.previousTrack.mockReturnValue({ id: 'previous' });

    usePlaybackTransport().playPrevious();

    expect(player.playTrack).toHaveBeenCalledWith({
      id: 'previous',
      playable: true,
    });
    expect(player.restartTrack).not.toHaveBeenCalled();
  });

  it('restarts the current track when there is no previous one', () => {
    usePlaybackTransport().playPrevious();

    expect(player.restartTrack).toHaveBeenCalledOnce();
    expect(player.playTrack).not.toHaveBeenCalled();
  });
});

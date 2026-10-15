import { beforeEach, describe, expect, it, vi } from 'vitest';

const player = vi.hoisted(() => ({
  playTrack: vi.fn(),
  restartTrack: vi.fn(),
}));
const queue = vi.hoisted(() => ({
  previousTrack: vi.fn(),
  nextTrack: vi.fn(),
}));
const toPlayableTrack = vi.hoisted(() =>
  vi.fn((track) => ({ ...track, playable: true })),
);

vi.mock('./usePlayer.js', () => ({ usePlayer: () => player }));
vi.mock('./usePlaybackQueue.js', () => ({ usePlaybackQueue: () => queue }));
vi.mock('../utils/playableTrack.js', () => ({ toPlayableTrack }));

import { usePlaybackTransport } from './usePlaybackTransport.js';

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
});

describe('usePlaybackTransport', () => {
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

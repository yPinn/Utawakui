import { describe, expect, it, vi } from 'vitest';
import { createRecentPlaybackActivation } from '../utils/recentPlaybackActivation.js';

function createHarness({ entry, playlists, tracks } = {}) {
  const setQueue = vi.fn();
  const interruptWithTrack = vi.fn();
  const playTrack = vi.fn(async () => {});
  const activateRecentEntry = createRecentPlaybackActivation({
    getPlaylists: () => playlists ?? [],
    getTracksById: () =>
      new Map((tracks ?? []).map((track) => [track.id, track])),
    setQueue,
    interruptWithTrack,
    playTrack,
  });

  return {
    entry,
    activateRecentEntry,
    setQueue,
    interruptWithTrack,
    playTrack,
  };
}

describe('recent playback activation', () => {
  it('rebuilds the current source playlist in its current order and starts at the history track', async () => {
    const trackA = { id: 'a', title: 'A' };
    const trackB = {
      id: 'b',
      title: 'B（目前資料）',
      hasSeparation: true,
      stemsUrl: 'utawakui-media://track/b/stems.wav',
    };
    const historyTrackB = { id: 'b', title: 'B（過期資料）' };
    const trackC = { id: 'c', title: 'C' };
    const harness = createHarness({
      entry: {
        trackId: 'b',
        sourceId: 'playlist-1',
        sourceName: '過期名稱',
        track: historyTrackB,
      },
      playlists: [
        {
          id: 'playlist-1',
          name: '目前名稱',
          trackIds: ['c', 'missing', 'a', 'b'],
        },
      ],
      tracks: [trackA, trackB, trackC],
    });

    await harness.activateRecentEntry(harness.entry);

    expect(harness.setQueue).toHaveBeenCalledWith(
      [trackC, trackA, trackB],
      'b',
      {
        sourceId: 'playlist-1',
        sourceName: '目前名稱',
      },
    );
    expect(harness.interruptWithTrack).not.toHaveBeenCalled();
    expect(harness.playTrack).toHaveBeenCalledWith({
      ...trackB,
      url: trackB.stemsUrl,
      usesSeparatedAudio: true,
    });
  });

  it.each([
    {
      name: 'the source playlist was deleted',
      entry: {
        trackId: 'b',
        sourceId: 'deleted-playlist',
        track: { id: 'b', title: 'B' },
      },
      playlists: [],
    },
    {
      name: 'the track was removed from the source playlist',
      entry: {
        trackId: 'b',
        sourceId: 'playlist-1',
        track: { id: 'b', title: 'B' },
      },
      playlists: [{ id: 'playlist-1', name: '歌單', trackIds: ['a'] }],
    },
    {
      name: 'the playback event had no playlist source',
      entry: {
        trackId: 'b',
        sourceId: null,
        track: { id: 'b', title: 'B' },
      },
      playlists: [{ id: 'playlist-1', name: '歌單', trackIds: ['a', 'b'] }],
    },
  ])('falls back to a single-track interrupt when $name', async (scenario) => {
    const harness = createHarness({
      ...scenario,
      tracks: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
    });

    await harness.activateRecentEntry(harness.entry);

    expect(harness.setQueue).not.toHaveBeenCalled();
    expect(harness.interruptWithTrack).toHaveBeenCalledWith(
      harness.entry.track,
    );
    expect(harness.playTrack).toHaveBeenCalledWith(harness.entry.track);
  });

  it('ignores an entry that no longer resolves to a library track', async () => {
    const harness = createHarness({
      entry: { trackId: 'missing', sourceId: null, track: null },
      playlists: [],
      tracks: [],
    });

    await expect(harness.activateRecentEntry(harness.entry)).resolves.toBe(
      false,
    );
    expect(harness.setQueue).not.toHaveBeenCalled();
    expect(harness.interruptWithTrack).not.toHaveBeenCalled();
    expect(harness.playTrack).not.toHaveBeenCalled();
  });
});

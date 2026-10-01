import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createRecentPlaybackActivation } from '../utils/recentPlaybackActivation.js';

const composableSource = readFileSync(
  new URL('./useRecentPlaybackActivation.js', import.meta.url),
  'utf8',
);
const activationSource = readFileSync(
  new URL('../utils/recentPlaybackActivation.js', import.meta.url),
  'utf8',
);

function createHarness(entry) {
  const interruptWithTrack = vi.fn();
  const playTrack = vi.fn(async () => {});
  const activateRecentEntry = createRecentPlaybackActivation({
    interruptWithTrack,
    playTrack,
  });

  return {
    entry,
    activateRecentEntry,
    interruptWithTrack,
    playTrack,
  };
}

describe('recent playback activation', () => {
  it('does not depend on playlist lookup or queue replacement', () => {
    expect(composableSource).not.toContain('usePlaylists');
    expect(composableSource).not.toContain('useLibrary');
    expect(composableSource).not.toContain('setQueue');
    expect(activationSource).not.toContain('getPlaylists');
    expect(activationSource).not.toContain('getTracksById');
    expect(activationSource).not.toContain('setQueue');
  });

  it('replays the visible history track without replacing the current queue', async () => {
    const track = {
      id: 'b',
      title: 'B',
      hasSeparation: true,
      stemsUrl: 'utawakui-media://track/b/stems.wav',
    };
    const harness = createHarness({
      trackId: 'b',
      sourceId: 'playlist-1',
      sourceName: '原始歌單',
      track,
    });

    await expect(harness.activateRecentEntry(harness.entry)).resolves.toBe(
      true,
    );

    expect(harness.interruptWithTrack).toHaveBeenCalledOnce();
    expect(harness.interruptWithTrack).toHaveBeenCalledWith(track);
    expect(harness.playTrack).toHaveBeenCalledWith({
      ...track,
      url: track.stemsUrl,
      usesSeparatedAudio: true,
    });
  });

  it('ignores a history entry that no longer resolves to a track', async () => {
    const harness = createHarness({
      trackId: 'missing',
      sourceId: null,
      track: null,
    });

    await expect(harness.activateRecentEntry(harness.entry)).resolves.toBe(
      false,
    );
    expect(harness.interruptWithTrack).not.toHaveBeenCalled();
    expect(harness.playTrack).not.toHaveBeenCalled();
  });
});

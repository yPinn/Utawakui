import { describe, expect, it } from 'vitest';
import { toPlayableTrack } from './playableTrack.js';

describe('toPlayableTrack', () => {
  it('uses stems when a separated playable variant exists', () => {
    const track = {
      id: 'track-1',
      title: 'Track 1',
      url: 'utawakui-media://track-1.webm',
      hasSeparation: true,
      stemsUrl: 'utawakui-media://track-1/stems.wav',
    };

    expect(toPlayableTrack(track)).toEqual({
      ...track,
      url: 'utawakui-media://track-1/stems.wav',
      usesSeparatedAudio: true,
    });
  });

  it('keeps the original track when stems are unavailable', () => {
    const track = {
      id: 'track-1',
      title: 'Track 1',
      url: 'utawakui-media://track-1.webm',
      hasSeparation: true,
    };

    expect(toPlayableTrack(track)).toBe(track);
  });

  it('returns null for a nullish track', () => {
    expect(toPlayableTrack(null)).toBe(null);
    expect(toPlayableTrack(undefined)).toBe(null);
  });
});

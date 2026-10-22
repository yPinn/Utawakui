import { describe, expect, it } from 'vitest';
import { createPlaybackClockSampler } from './playbackClockSample.js';

describe('read-only media clock sampling', () => {
  it('uses native terminal/seek/pause flags conservatively while retaining buffering', () => {
    const audio = {
      currentTime: 1,
      playbackRate: 1.25,
      paused: false,
      seeking: false,
      ended: false,
    };
    const state = {
      track: { id: 'a' },
      playbackPhase: 'playing',
      playbackRevision: 2,
      continuityRevision: 3,
    };
    const sample = createPlaybackClockSampler(audio, state);
    audio.paused = true;
    expect(sample().phase).toBe('paused');
    state.playbackPhase = 'buffering';
    expect(sample().phase).toBe('buffering');
    audio.seeking = true;
    expect(sample().phase).toBe('seeking');
    audio.ended = true;
    expect(sample().phase).toBe('ended');
    expect(state.playbackPhase).toBe('buffering');
  });

  it('bounds unavailable media positions without mutating an event-owned position', () => {
    const audio = { currentTime: Number.NaN, playbackRate: 1 };
    const state = { currentTime: 12, playbackPhase: 'idle' };
    const sample = createPlaybackClockSampler(audio, state);
    expect(sample({ now: () => 'paired' })).toMatchObject({
      positionMs: 0,
      sampledAt: 'paired',
      trackId: null,
      phase: 'idle',
    });
    audio.currentTime = -1;
    expect(sample().positionMs).toBe(0);
    expect(state.currentTime).toBe(12);
  });
});

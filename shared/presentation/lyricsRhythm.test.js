import { describe, expect, it } from 'vitest';

import {
  confidentTempo,
  createLyricsRhythmPresentation,
  scaleLyricsMotionDuration,
} from './lyricsRhythm.mjs';

function beatGrid({ confidence = 0.9, startMs = 9000 } = {}) {
  return Array.from({ length: 12 }, (_value, index) => ({
    timeMs: startMs + index * 500,
    positionInBar: (index % 4) + 1,
    downbeat: index % 4 === 0,
    confidence,
  }));
}

describe('shared lyrics rhythm presentation', () => {
  it('projects a line-relative cue from a confident regular beat grid', () => {
    const rhythm = createLyricsRhythmPresentation({
      beats: beatGrid(),
      lineEndMs: 13000,
      lineStartMs: 9000,
      playbackRate: 1,
      positionMs: 11250,
      tempo: { bpm: 120, confidence: 0.9 },
    });

    expect(rhythm).toMatchObject({
      timingSource: 'beat-grid',
      bpm: 120,
      beatDurationMs: 500,
      beatProgress: 0.5,
      lineBeatCount: 8,
      lineBeatIndex: 4,
      motionScale: 1,
      currentBeat: {
        beatIndex: 4,
        lyricsTimeMs: 11000,
        positionInBar: 1,
        downbeat: true,
        confidence: 0.9,
      },
      nextBeat: {
        beatIndex: 5,
        lyricsTimeMs: 11500,
        delayMs: 250,
      },
    });
  });

  it('maps source beats through the lyrics offset and playback rate', () => {
    const rhythm = createLyricsRhythmPresentation({
      beats: beatGrid({ startMs: 8000 }),
      lineEndMs: 13000,
      lineStartMs: 9000,
      lyricsOffsetMs: 1000,
      playbackRate: 2,
      positionMs: 11250,
      tempo: { bpm: 120, confidence: 0.9 },
    });

    expect(rhythm).toMatchObject({
      timingSource: 'beat-grid',
      currentBeat: { beatIndex: 4, lyricsTimeMs: 11000 },
      nextBeat: { beatIndex: 5, lyricsTimeMs: 11500, delayMs: 125 },
    });
  });

  it('falls back to tempo cadence when the local beat grid is irregular', () => {
    const rhythm = createLyricsRhythmPresentation({
      beats: [9000, 9500, 10000, 12000, 12500, 13000].map((timeMs, index) => ({
        timeMs,
        confidence: 0.9,
        positionInBar: index,
      })),
      lineEndMs: 14000,
      lineStartMs: 9000,
      playbackRate: 1,
      positionMs: 11000,
      tempo: { bpm: 120, confidence: 0.8 },
    });

    expect(rhythm).toEqual({
      timingSource: 'tempo',
      bpm: 120,
      beatDurationMs: 500,
      beatProgress: null,
      lineBeatCount: 10,
      lineBeatIndex: null,
      motionScale: 1,
      currentBeat: null,
      nextBeat: null,
    });
  });

  it('omits line-relative counts instead of scanning an unbounded lyric span', () => {
    let indexedBeatReads = 0;
    const beatValues = Array.from({ length: 1000 }, (_value, index) => ({
      timeMs: index * 500,
      confidence: 0.9,
    }));
    const beats = new Proxy(beatValues, {
      get(target, property, receiver) {
        if (/^\d+$/.test(String(property))) indexedBeatReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(
      createLyricsRhythmPresentation({
        beats,
        lineEndMs: 500000,
        lineStartMs: 0,
        positionMs: 250000,
        tempo: { bpm: 120, confidence: 0.9 },
      }),
    ).toMatchObject({
      timingSource: 'beat-grid',
      lineBeatCount: null,
      lineBeatIndex: null,
    });
    expect(indexedBeatReads).toBeLessThan(80);
  });

  it('does not treat missing or low confidence as rhythmic certainty', () => {
    expect(
      createLyricsRhythmPresentation({
        beats: beatGrid({ confidence: 0.49 }),
        lineEndMs: 13000,
        lineStartMs: 9000,
        positionMs: 11000,
        tempo: { bpm: 120, confidence: 0.49 },
      }),
    ).toBeNull();
    expect(
      createLyricsRhythmPresentation({
        beats: [],
        positionMs: null,
        tempo: { bpm: 120, confidence: 0.9 },
      }),
    ).toBeNull();
    expect(
      createLyricsRhythmPresentation({
        beats: [],
        positionMs: 11000,
        tempo: { bpm: '120', confidence: 0.9 },
      }),
    ).toBeNull();
    expect(
      createLyricsRhythmPresentation({
        beats: [],
        lineEndMs: null,
        lineStartMs: null,
        positionMs: 11000,
        tempo: { bpm: 120 },
      }),
    ).toBeNull();
  });

  it('bounds motion scaling without changing the template baseline', () => {
    const fast = createLyricsRhythmPresentation({
      beats: [],
      positionMs: 0,
      tempo: { bpm: 240, confidence: 0.9 },
    });
    const slow = createLyricsRhythmPresentation({
      beats: [],
      positionMs: 0,
      tempo: { bpm: 60, confidence: 0.9 },
    });

    expect(fast.motionScale).toBe(0.75);
    expect(slow.motionScale).toBe(1.35);
    expect(scaleLyricsMotionDuration(240, fast)).toBe(180);
    expect(scaleLyricsMotionDuration(0.3, slow)).toBe(0.405);
    expect(scaleLyricsMotionDuration(240, null)).toBe(240);
    expect(scaleLyricsMotionDuration('240', slow)).toBe(0);
  });

  describe('confidentTempo', () => {
    it('returns the BPM when confidence meets the presentation gate', () => {
      expect(confidentTempo({ bpm: 128, confidence: 0.5 })).toBe(128);
      expect(confidentTempo({ bpm: 128, confidence: 0.82 })).toBe(128);
    });

    it('rejects tempo below the confidence gate', () => {
      expect(confidentTempo({ bpm: 128, confidence: 0.49 })).toBeNull();
      expect(confidentTempo({ bpm: 128, confidence: 0 })).toBeNull();
      expect(confidentTempo({ bpm: 128 })).toBeNull();
    });

    it('rejects a BPM outside the 20-400 contract range', () => {
      expect(confidentTempo({ bpm: 19, confidence: 0.9 })).toBeNull();
      expect(confidentTempo({ bpm: 401, confidence: 0.9 })).toBeNull();
      expect(confidentTempo({ bpm: 20, confidence: 0.9 })).toBe(20);
      expect(confidentTempo({ bpm: 400, confidence: 0.9 })).toBe(400);
    });

    it('rejects a non-finite or missing BPM', () => {
      expect(confidentTempo({ bpm: NaN, confidence: 0.9 })).toBeNull();
      expect(confidentTempo(null)).toBeNull();
      expect(confidentTempo(undefined)).toBeNull();
    });
  });
});

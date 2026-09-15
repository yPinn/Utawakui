import { describe, expect, it } from 'vitest';
import {
  beatIntervalSeconds,
  collectDueBeats,
  isAccentBeat,
  nextBeatNumber,
} from './metronomeSchedule.js';

describe('beatIntervalSeconds', () => {
  it('converts BPM to seconds per beat', () => {
    expect(beatIntervalSeconds(120)).toBe(0.5);
    expect(beatIntervalSeconds(60)).toBe(1);
  });
});

describe('isAccentBeat', () => {
  it('is true only for the first beat', () => {
    expect(isAccentBeat(1)).toBe(true);
    expect(isAccentBeat(2)).toBe(false);
    expect(isAccentBeat(4)).toBe(false);
  });
});

describe('nextBeatNumber', () => {
  it('wraps back to 1 at the bar boundary', () => {
    expect(nextBeatNumber(1, 4)).toBe(2);
    expect(nextBeatNumber(3, 4)).toBe(4);
    expect(nextBeatNumber(4, 4)).toBe(1);
  });
});

describe('collectDueBeats', () => {
  it('returns no beats when nothing falls inside the lookahead window', () => {
    const result = collectDueBeats({
      nextBeatTime: 10,
      beatNumber: 1,
      bpm: 120,
      beatsPerBar: 4,
      now: 0,
      lookaheadSeconds: 0.1,
    });
    expect(result.beats).toEqual([]);
    expect(result.nextBeatTime).toBe(10);
    expect(result.beatNumber).toBe(1);
  });

  it('emits every beat that falls inside the lookahead window, in order', () => {
    const result = collectDueBeats({
      nextBeatTime: 0,
      beatNumber: 1,
      bpm: 120, // 0.5s/beat
      beatsPerBar: 4,
      now: 0.9,
      lookaheadSeconds: 0.1, // horizon = 1.0
    });
    expect(result.beats).toEqual([
      { time: 0, beatNumber: 1, accent: true },
      { time: 0.5, beatNumber: 2, accent: false },
    ]);
    expect(result.nextBeatTime).toBe(1);
    expect(result.beatNumber).toBe(3);
  });

  it('wraps beat numbers across the bar and flags the downbeat accent', () => {
    const result = collectDueBeats({
      nextBeatTime: 0,
      beatNumber: 4,
      bpm: 120,
      beatsPerBar: 4,
      now: 0.4,
      lookaheadSeconds: 0.2, // horizon = 0.6 -> beats at 0 (beat 4) and 0.5 (beat 1)
    });
    expect(result.beats).toEqual([
      { time: 0, beatNumber: 4, accent: false },
      { time: 0.5, beatNumber: 1, accent: true },
    ]);
    expect(result.nextBeatTime).toBe(1);
    expect(result.beatNumber).toBe(2);
  });

  it('continues seamlessly from the anchored time when BPM changes mid-stream', () => {
    // Simulates adjusting BPM while running: only the *next* call's interval
    // changes; the already-anchored nextBeatTime is not thrown away and
    // recomputed from "now", unlike the old setTimeout-based scheduler.
    const first = collectDueBeats({
      nextBeatTime: 0,
      beatNumber: 1,
      bpm: 120,
      beatsPerBar: 4,
      now: 0,
      lookaheadSeconds: 0.1,
    });
    expect(first.nextBeatTime).toBe(0.5);

    const second = collectDueBeats({
      nextBeatTime: first.nextBeatTime,
      beatNumber: first.beatNumber,
      bpm: 60, // slows down starting from the anchored point, not from "now"
      beatsPerBar: 4,
      now: 0.5,
      lookaheadSeconds: 0.1,
    });
    expect(second.beats).toEqual([{ time: 0.5, beatNumber: 2, accent: false }]);
    expect(second.nextBeatTime).toBe(1.5);
  });

  it('resyncs to now instead of firing a backlog after a long stall', () => {
    const result = collectDueBeats({
      nextBeatTime: 0,
      beatNumber: 1,
      bpm: 120,
      beatsPerBar: 4,
      now: 30, // e.g. tab was backgrounded for 30s
      lookaheadSeconds: 0.1,
      resyncThresholdSeconds: 1,
    });
    expect(result.beats).toEqual([{ time: 30, beatNumber: 1, accent: true }]);
    expect(result.nextBeatTime).toBe(30.5);
  });

  it('caps beats emitted per call at maxBeats', () => {
    const result = collectDueBeats({
      nextBeatTime: 0,
      beatNumber: 1,
      bpm: 6000, // 0.01s/beat - deliberately absurd to force the cap
      beatsPerBar: 4,
      now: 1,
      lookaheadSeconds: 1,
      maxBeats: 3,
    });
    expect(result.beats).toHaveLength(3);
  });

  it('does not accumulate floating-point drift across 1000 beats', () => {
    const bpm = 133;
    const interval = beatIntervalSeconds(bpm);
    let nextBeatTime = 0;
    let beatNumber = 1;
    let totalBeats = 0;
    let now = 0;
    const step = 0.025; // simulate a 25ms lookahead poll tick

    while (totalBeats < 1000) {
      const result = collectDueBeats({
        nextBeatTime,
        beatNumber,
        bpm,
        beatsPerBar: 4,
        now,
        lookaheadSeconds: 0.1,
      });
      totalBeats += result.beats.length;
      nextBeatTime = result.nextBeatTime;
      beatNumber = result.beatNumber;
      now += step;
    }

    // The 1000th beat's scheduled time must equal the exact arithmetic
    // anchor (999 * interval), not something eroded by repeated
    // setTimeout-style "now + interval" rescheduling.
    expect(nextBeatTime).toBeCloseTo(1000 * interval, 9);
  });
});

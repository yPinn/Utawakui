import { describe, expect, it } from 'vitest';
import { selectPerformerFrame } from './performerView.js';

function snapshot() {
  return {
    version: 1,
    state: {
      revision: 4,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'playing',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song', artist: 'Singer' },
      },
      queue: {
        sourceName: 'Setlist',
        items: [
          { state: 'current', track: { id: 'track-1', title: 'Song' } },
          { state: 'queued', track: { id: 'track-2', title: 'Next' } },
        ],
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'ja' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [
          { text: 'first', startMs: 1000, endMs: 2000 },
          { text: 'second', startMs: 2000, endMs: 3000 },
        ],
      },
    },
    adjustments: {
      transposeSemitones: -2,
      pitchCents: 10,
      tempoRate: 0.9,
    },
    readings: {
      trackId: 'track-1',
      lines: [{ text: 'first', romaji: 'first reading', segments: [] }, null],
    },
  };
}

describe('selectPerformerFrame', () => {
  it('projects the live cue, next cue, adjustments, and next track', () => {
    expect(
      selectPerformerFrame(snapshot(), {
        nowMs: Date.parse('2026-08-22T00:00:00.200Z'),
      }),
    ).toMatchObject({
      mode: 'live',
      currentLine: { text: 'first' },
      currentReading: { romaji: 'first reading' },
      nextLine: { text: 'second' },
      nextTrack: { title: 'Next' },
      keyLabel: 'Key -2 · +10¢',
      tempoLabel: '90%',
      readingExpected: true,
    });
  });

  it('uses the first future cue while waiting before the song starts', () => {
    const value = snapshot();
    value.state.playback.positionMs = 0;
    expect(
      selectPerformerFrame(value, {
        nowMs: Date.parse('2026-08-22T00:00:00.000Z'),
      }),
    ).toMatchObject({
      mode: 'waiting',
      currentLine: null,
      nextLine: { text: 'first' },
    });
  });

  it('distinguishes idle, missing lyrics, and unsynced lyrics', () => {
    const idle = snapshot();
    idle.state.playback.track = null;
    expect(selectPerformerFrame(idle).mode).toBe('idle');

    const missing = snapshot();
    missing.state.lyrics.lines = [];
    expect(selectPerformerFrame(missing).mode).toBe('no-lyrics');

    const unsynced = snapshot();
    unsynced.state.lyrics.synced = false;
    expect(selectPerformerFrame(unsynced).mode).toBe('unsynced');
  });
});

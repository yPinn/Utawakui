import { describe, expect, it } from 'vitest';
import performerSnapshotModule from './performerSnapshot.js';

const { createEmptyPerformerSnapshot, parsePerformerSnapshot } =
  performerSnapshotModule;

function snapshot() {
  const value = createEmptyPerformerSnapshot({
    revision: 7,
    generatedAt: '2026-08-22T00:00:00.000Z',
  });
  value.state.playback = {
    status: 'playing',
    positionMs: 1200,
    durationMs: 200000,
    rate: 0.9,
    track: { id: 'track-1', title: 'Song', artist: 'Singer' },
  };
  value.state.lyrics = {
    trackId: 'track-1',
    source: { language: 'ja' },
    synced: true,
    offsetMs: 0,
    activeLineIndex: 0,
    lines: [{ text: '夜に駆ける', startMs: 1000, endMs: 3000 }],
  };
  value.adjustments = {
    transposeSemitones: -2,
    pitchCents: 12,
    tempoRate: 0.9,
  };
  value.readings = {
    trackId: 'track-1',
    lines: [
      {
        text: '夜に駆ける',
        romaji: 'yoru ni kakeru',
        segments: [{ text: '夜', reading: 'よる' }, { text: 'に駆ける' }],
      },
    ],
  };
  return value;
}

describe('performer snapshot contract', () => {
  it('creates a valid idle snapshot', () => {
    expect(
      createEmptyPerformerSnapshot({
        generatedAt: '2026-08-22T00:00:00.000Z',
      }),
    ).toMatchObject({
      version: 1,
      state: { displayDelayMs: 0, playback: { status: 'idle' } },
      readings: { trackId: null, lines: [] },
    });
  });

  it('accepts aligned lyrics readings and performance adjustments', () => {
    expect(parsePerformerSnapshot(snapshot())).toEqual(snapshot());
  });

  it('rejects public display delay and stale reading alignment', () => {
    const delayed = snapshot();
    delayed.state.displayDelayMs = 250;
    expect(() => parsePerformerSnapshot(delayed)).toThrow('must be 0');

    const stale = snapshot();
    stale.readings.lines[0].text = 'different';
    expect(() => parsePerformerSnapshot(stale)).toThrow(
      'must match the lyric line',
    );
  });
});

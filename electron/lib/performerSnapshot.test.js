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
    variant: 'furigana',
    availableVariants: [],
    preparing: false,
    error: '',
    lines: [
      {
        text: '夜に駆ける',
        romaji: 'yoru ni kakeru',
        segments: [{ text: '夜', reading: 'よる' }, { text: 'に駆ける' }],
      },
    ],
  };
  value.controls = {
    lyricsOffset: {
      available: true,
      saving: false,
      error: '',
    },
  };
  return value;
}

describe('performer snapshot contract', () => {
  it.each([
    { availableVariants: ['off', 'off'] },
    { availableVariants: ['unexpected'] },
    { availableVariants: 'romaji' },
    { preparing: 'yes' },
    { error: 'x'.repeat(241) },
  ])('rejects unbounded reading toolbar status %j', (fields) => {
    const value = snapshot();
    Object.assign(value.readings, fields);
    expect(() => parsePerformerSnapshot(value)).toThrow('readings');
  });
  it('rejects malformed reading content and mismatched track identity', () => {
    const invalidValues = [
      { ...snapshot().readings, lines: null },
      { ...snapshot().readings, lines: [] },
      { ...snapshot().readings, trackId: 'other' },
      {
        ...snapshot().readings,
        lines: [{ text: '夜に駆ける', segments: null }],
      },
      {
        ...snapshot().readings,
        lines: [
          {
            text: '夜に駆ける',
            segments: Array.from({ length: 161 }, () => ({ text: '夜' })),
          },
        ],
      },
    ];
    for (const readings of invalidValues) {
      const value = snapshot();
      value.readings = readings;
      expect(() => parsePerformerSnapshot(value)).toThrow('readings');
    }
  });

  it.each(['off', 'furigana', 'romaji'])(
    'preserves reading variant %s through main validation',
    (variant) => {
      const value = snapshot();
      value.readings.variant = variant;
      expect(parsePerformerSnapshot(value).readings.variant).toBe(variant);
    },
  );

  it('defaults old snapshots without a reading preference to off', () => {
    const value = snapshot();
    delete value.readings.variant;
    expect(parsePerformerSnapshot(value).readings.variant).toBe('off');
  });

  it.each(['both', '', null, true, 1])(
    'rejects unsupported reading variant %j',
    (variant) => {
      const value = snapshot();
      value.readings.variant = variant;
      expect(() => parsePerformerSnapshot(value)).toThrow('readings.variant');
    },
  );

  it('creates a valid idle snapshot', () => {
    expect(
      createEmptyPerformerSnapshot({
        generatedAt: '2026-08-22T00:00:00.000Z',
      }),
    ).toMatchObject({
      version: 2,
      state: { displayDelayMs: 0, playback: { status: 'idle' } },
      readings: { trackId: null, lines: [] },
      controls: {
        lyricsOffset: { available: false, saving: false, error: '' },
      },
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

  it('rejects malformed or overlong sync-control state', () => {
    const malformed = snapshot();
    malformed.controls.lyricsOffset.available = 'yes';
    expect(() => parsePerformerSnapshot(malformed)).toThrow(
      'controls.lyricsOffset.available',
    );

    const unbounded = snapshot();
    unbounded.controls.lyricsOffset.error = 'x'.repeat(241);
    expect(() => parsePerformerSnapshot(unbounded)).toThrow(
      'controls.lyricsOffset.error',
    );
  });
});

import { describe, expect, it } from 'vitest';
import outputContract from './outputContract.js';

const {
  MAX_OUTPUT_LYRIC_LINES,
  MAX_OUTPUT_QUEUE_ITEMS,
  OUTPUT_STATE_VERSION,
  createEmptyOutputSnapshot,
  isOutputSnapshot,
  parseOutputSnapshot,
} = outputContract;

const GENERATED_AT = '2026-08-25T00:00:00.000Z';

function emptySnapshot() {
  return createEmptyOutputSnapshot({ generatedAt: GENERATED_AT });
}

function queueItem(overrides = {}) {
  return {
    state: 'queued',
    track: { id: 'track-1', title: 'Song' },
    ...overrides,
  };
}

function lyricLine(overrides = {}) {
  return {
    text: 'line',
    startMs: 1000,
    endMs: 2000,
    ...overrides,
  };
}

describe('output snapshot contract boundaries', () => {
  it('canonicalizes all public playback, queue, and lyrics fields', () => {
    const base = emptySnapshot();
    const parsed = parseOutputSnapshot({
      ...base,
      revision: 7,
      displayDelayMs: -2000,
      playback: {
        status: 'playing',
        positionMs: 1250,
        durationMs: 9000,
        rate: 1.25,
        track: {
          id: 'track-1',
          title: 'Song',
          artist: 'Singer',
          privatePath: 'C:\\Music\\Song.wav',
        },
      },
      queue: {
        sourceName: 'Tonight',
        items: [queueItem({ state: 'current' })],
      },
      lyrics: {
        trackId: 'track-1',
        source: { kind: 'manual', language: 'ja', label: 'Main' },
        synced: true,
        offsetMs: -250,
        activeLineIndex: 0,
        lines: [lyricLine()],
      },
      privateDebug: true,
    });

    expect(parsed).toEqual({
      version: OUTPUT_STATE_VERSION,
      revision: 7,
      generatedAt: GENERATED_AT,
      displayDelayMs: -2000,
      playback: {
        status: 'playing',
        positionMs: 1250,
        durationMs: 9000,
        rate: 1.25,
        track: { id: 'track-1', title: 'Song', artist: 'Singer' },
      },
      queue: {
        sourceName: 'Tonight',
        items: [
          {
            state: 'current',
            track: { id: 'track-1', title: 'Song' },
          },
        ],
      },
      lyrics: {
        trackId: 'track-1',
        source: { kind: 'manual', language: 'ja', label: 'Main' },
        synced: true,
        offsetMs: -250,
        activeLineIndex: 0,
        lines: [lyricLine()],
      },
    });
  });

  it('bounds public strings and omits empty optional fields', () => {
    const base = emptySnapshot();
    const parsed = parseOutputSnapshot({
      ...base,
      playback: {
        ...base.playback,
        track: {
          id: 'i'.repeat(250),
          title: 't'.repeat(350),
          artist: '',
        },
      },
      lyrics: {
        ...base.lyrics,
        source: { kind: '', language: null, label: undefined },
        lines: [lyricLine({ text: 'x'.repeat(2100) })],
        activeLineIndex: 0,
      },
    });

    expect(parsed.playback.track).toEqual({
      id: 'i'.repeat(200),
      title: 't'.repeat(300),
    });
    expect(parsed.lyrics.source).toEqual({});
    expect(parsed.lyrics.lines[0].text).toHaveLength(2000);
  });

  it.each([
    ['null root', null, /root/],
    ['array root', [], /root/],
    ['unsupported version', { ...emptySnapshot(), version: 3 }, /version/],
    [
      'non-canonical timestamp',
      { ...emptySnapshot(), generatedAt: '2026-08-25' },
      /generatedAt/,
    ],
    ['negative revision', { ...emptySnapshot(), revision: -1 }, /revision/],
    ['fractional revision', { ...emptySnapshot(), revision: 1.5 }, /revision/],
    [
      'excessive display delay',
      { ...emptySnapshot(), displayDelayMs: 5001 },
      /displayDelayMs/,
    ],
  ])('rejects an invalid %s', (_label, input, expectedPath) => {
    expect(() => parseOutputSnapshot(input)).toThrow(expectedPath);
    expect(isOutputSnapshot(input)).toBe(false);
  });

  it.each([
    ['status', { status: 'stopped' }, /playback\.status/],
    ['position', { positionMs: -1 }, /playback\.positionMs/],
    ['duration', { durationMs: 1.5 }, /playback\.durationMs/],
    ['rate minimum', { rate: 0.09 }, /playback\.rate/],
    ['rate maximum', { rate: 4.01 }, /playback\.rate/],
    ['track record', { track: [] }, /playback\.track/],
    ['track id', { track: { id: '', title: 'Song' } }, /playback\.track\.id/],
  ])('rejects invalid playback %s', (_label, overrides, expectedPath) => {
    const base = emptySnapshot();
    const input = {
      ...base,
      playback: { ...base.playback, ...overrides },
    };

    expect(() => parseOutputSnapshot(input)).toThrow(expectedPath);
  });

  it('enforces queue collection, state, and track bounds', () => {
    const base = emptySnapshot();
    const parseQueue = (queue) => parseOutputSnapshot({ ...base, queue });

    expect(() => parseQueue({ sourceName: '', items: null })).toThrow(
      /queue\.items/,
    );
    expect(() =>
      parseQueue({
        sourceName: '',
        items: Array.from({ length: MAX_OUTPUT_QUEUE_ITEMS + 1 }, () =>
          queueItem(),
        ),
      }),
    ).toThrow(/queue\.items/);
    expect(() =>
      parseQueue({ sourceName: '', items: [queueItem({ state: 'future' })] }),
    ).toThrow(/queue\.items\[0\]\.state/);
    expect(() => parseQueue({ sourceName: '', items: [null] })).toThrow(
      /queue\.items\[0\]/,
    );
  });

  it('enforces lyric collection, timing, index, and metadata bounds', () => {
    const base = emptySnapshot();
    const parseLyrics = (lyrics) => parseOutputSnapshot({ ...base, lyrics });

    expect(() => parseLyrics({ ...base.lyrics, lines: null })).toThrow(
      /lyrics\.lines/,
    );
    expect(() =>
      parseLyrics({
        ...base.lyrics,
        lines: Array.from({ length: MAX_OUTPUT_LYRIC_LINES + 1 }, () =>
          lyricLine(),
        ),
      }),
    ).toThrow(/lyrics\.lines/);
    expect(() =>
      parseLyrics({ ...base.lyrics, lines: [lyricLine({ endMs: 999 })] }),
    ).toThrow(/endMs/);
    expect(() =>
      parseLyrics({
        ...base.lyrics,
        lines: [lyricLine()],
        activeLineIndex: 1,
      }),
    ).toThrow(/activeLineIndex/);
    expect(() => parseLyrics({ ...base.lyrics, synced: 'yes' })).toThrow(
      /lyrics\.synced/,
    );
    expect(() => parseLyrics({ ...base.lyrics, offsetMs: 600001 })).toThrow(
      /lyrics\.offsetMs/,
    );
    expect(() => parseLyrics({ ...base.lyrics, source: [] })).toThrow(
      /lyrics\.source/,
    );
    expect(() => parseLyrics({ ...base.lyrics, trackId: '' })).toThrow(
      /lyrics\.trackId/,
    );
  });

  it('accepts null lyric times and recognizes a canonical snapshot', () => {
    const base = emptySnapshot();
    const parsed = parseOutputSnapshot({
      ...base,
      lyrics: {
        ...base.lyrics,
        lines: [lyricLine({ startMs: null, endMs: null })],
        activeLineIndex: 0,
      },
    });

    expect(parsed.lyrics.lines[0]).toEqual({
      text: 'line',
      startMs: null,
      endMs: null,
    });
    expect(isOutputSnapshot(parsed)).toBe(true);
  });
});

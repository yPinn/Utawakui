import { describe, expect, it } from 'vitest';
import { selectPerformerFrame } from './performerFrame.mjs';

function snapshot() {
  return {
    version: 2,
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
        offsetMs: -200,
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
      variant: 'romaji',
      lines: [{ text: 'first', romaji: 'first reading', segments: [] }, null],
    },
    controls: {
      lyricsOffset: {
        available: true,
        saving: false,
        error: '',
      },
    },
  };
}

describe('selectPerformerFrame', () => {
  it('resolves open source ends from the next cue or duration without changing canonical lines', () => {
    const value = snapshot();
    value.state.playback.status = 'paused';
    value.state.playback.positionMs = 1500;
    value.state.lyrics.lines[0].endMs = null;
    expect(selectPerformerFrame(value).currentLine.endMs).toBe(2000);
    value.state.lyrics.lines = [value.state.lyrics.lines[0]];
    expect(selectPerformerFrame(value).currentLine.endMs).toBe(9800);
    expect(value.state.lyrics.lines[0].endMs).toBeNull();
  });
  it('keeps an absent snapshot idle with reading disabled', () => {
    expect(selectPerformerFrame()).toMatchObject({
      mode: 'idle',
      currentReading: null,
      nextReading: null,
      readingExpected: false,
      keyLabel: '原調',
      tempoLabel: '100%',
      nextTrack: null,
    });
  });

  it.each(['off', 'furigana', 'romaji'])(
    'applies %s to both current and next reading without changing lyrics or offset',
    (variant) => {
      const value = snapshot();
      value.readings.variant = variant;
      value.readings.lines = ['first', 'second'].map((text) => ({
        text,
        romaji: `${text} romaji`,
        segments: [{ text, reading: `${text} kana` }],
      }));
      const result = selectPerformerFrame(value, {
        nowMs: Date.parse(value.state.generatedAt) + 200,
      });
      for (const [key, text] of [
        ['currentReading', 'first'],
        ['nextReading', 'second'],
      ]) {
        expect(result[key]).toEqual(
          variant === 'off'
            ? null
            : {
                text,
                ...(variant === 'romaji' ? { romaji: `${text} romaji` } : {}),
                segments:
                  variant === 'furigana'
                    ? [{ text, reading: `${text} kana` }]
                    : [],
              },
        );
      }
      expect(result.readingExpected).toBe(variant !== 'off');
      expect(result.currentLine.text).toBe('first');
      expect(result.nextLine.text).toBe('second');
      expect(result.lyricsOffset.milliseconds).toBe(-200);
    },
  );

  it('keeps reading disabled when the preference is missing and preserves enabled missing-data notices', () => {
    const value = snapshot();
    delete value.readings.variant;
    let result = selectPerformerFrame(value, {
      nowMs: Date.parse(value.state.generatedAt) + 200,
    });
    expect(result.currentReading).toBeNull();
    expect(result.readingExpected).toBe(false);
    value.readings.variant = 'furigana';
    value.readings.lines = [null, null];
    result = selectPerformerFrame(value, {
      nowMs: Date.parse(value.state.generatedAt) + 200,
    });
    expect(result.currentReading).toBeNull();
    expect(result.readingExpected).toBe(true);
  });

  it('projects the live cue and bounded sync-control state', () => {
    expect(
      selectPerformerFrame(snapshot(), {
        nowMs: Date.parse('2026-08-22T00:00:00.200Z'),
      }),
    ).toMatchObject({
      revision: 4,
      trackId: 'track-1',
      mode: 'live',
      currentLine: { text: 'first' },
      currentReading: { romaji: 'first reading' },
      nextLine: { text: 'second' },
      nextTrack: { title: 'Next' },
      keyLabel: 'Key -2 · +10¢',
      tempoLabel: '90%',
      readingExpected: true,
      lyricsOffset: {
        milliseconds: -200,
        available: true,
        saving: false,
        error: '',
      },
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
      currentLine: { text: 'first' },
      nextLine: { text: 'second' },
    });
  });

  it('holds the positioned lyric through gaps and after the final end without claiming active singing', () => {
    const value = snapshot();
    value.state.playback.status = 'paused';
    value.state.lyrics.offsetMs = 0;
    value.state.lyrics.lines[1].startMs = 4000;
    value.state.lyrics.lines[1].endMs = 5000;
    value.state.playback.positionMs = 3000;
    expect(selectPerformerFrame(value)).toMatchObject({
      mode: 'waiting',
      currentLine: { text: 'first' },
      nextLine: { text: 'second' },
      currentWordCue: null,
    });
    value.state.playback.positionMs = 6000;
    expect(selectPerformerFrame(value)).toMatchObject({
      currentLine: { text: 'second' },
      nextLine: null,
      currentWordCue: null,
    });
    value.state.lyrics.synced = false;
    value.state.lyrics.activeLineIndex = -1;
    expect(selectPerformerFrame(value)).toMatchObject({
      mode: 'unsynced',
      currentLine: { text: 'first' },
      nextLine: { text: 'second' },
    });
    value.state.lyrics.trackId = 'other';
    expect(selectPerformerFrame(value)).toMatchObject({
      mode: 'no-lyrics',
      currentLine: null,
      nextLine: null,
    });
  });

  it('uses only a matching, currently valid word cue and clears it on gaps, seek and track changes', () => {
    const value = snapshot();
    value.state.playback.status = 'paused';
    value.state.playback.positionMs = 1500;
    value.state.lyrics.offsetMs = 0;
    value.wordCue = {
      lineIndex: 0,
      from: 0,
      to: 3,
      startMs: 1000,
      endMs: 1800,
    };
    expect(selectPerformerFrame(value).currentWordCue).toEqual({
      from: 0,
      to: 3,
    });
    value.state.playback.positionMs = 1900;
    expect(selectPerformerFrame(value).currentWordCue).toBeNull();
    value.state.playback.positionMs = 2200;
    expect(selectPerformerFrame(value).currentWordCue).toBeNull();
    value.state.lyrics.trackId = 'other';
    expect(selectPerformerFrame(value).currentWordCue).toBeNull();
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

  it('fails closed when controls are absent', () => {
    const value = snapshot();
    delete value.controls;
    expect(selectPerformerFrame(value).lyricsOffset).toEqual({
      milliseconds: -200,
      available: false,
      saving: false,
      error: '',
    });
  });
});

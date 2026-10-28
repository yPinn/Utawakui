import { describe, expect, it } from 'vitest';
import { projectPerformerSnapshot } from './performerSnapshot.js';

describe('projectPerformerSnapshot', () => {
  it.each(['t2', 'acoustic-estimate'])(
    'projects only the existing %s active word with bounded source coordinates',
    (timingSource) => {
      const input = {
        player: { track: { id: 'a' } },
        lyrics: {
          trackId: 'a',
          source: { filename: 'a.lrc' },
          activeLineIndex: 0,
          lines: [{ lineId: 'l', text: 'AB CD', start: 1, end: 4 }],
          wordFrame: {
            lineId: 'l',
            text: 'AB CD',
            timingSource,
            chunks: [
              { text: 'AB', startMs: 1000, endMs: 2000, state: 'past' },
              { text: ' CD', startMs: 2200, endMs: 4000, state: 'active' },
            ],
          },
        },
      };
      expect(projectPerformerSnapshot(input).wordCue).toEqual({
        lineIndex: 0,
        from: 2,
        to: 5,
        startMs: 2200,
        endMs: 4000,
      });
      input.lyrics.wordFrame.chunks[1].cueActive = false;
      expect(projectPerformerSnapshot(input)).not.toHaveProperty('wordCue');
      input.lyrics.wordFrame.chunks[1].cueActive = true;
      input.lyrics.wordFrame.text = 'stale';
      expect(projectPerformerSnapshot(input)).not.toHaveProperty('wordCue');
    },
  );
  it.each(['off', 'furigana', 'romaji'])(
    'projects the shared reading preference %s',
    (variant) => {
      expect(
        projectPerformerSnapshot({ readings: { variant } }).readings.variant,
      ).toBe(variant);
    },
  );

  it('reuses canonical player/queue/lyrics projection and aligns readings', () => {
    const result = projectPerformerSnapshot(
      {
        player: {
          playbackPhase: 'playing',
          currentTime: 2.5,
          duration: 120,
          tempoRate: 0.9,
          transposeSemitones: -2,
          pitchCents: 15,
          track: { id: 'track-1', title: 'Song', artist: 'Singer' },
        },
        queue: {
          currentTrack: { id: 'track-1', title: 'Song' },
          upcomingTracks: [{ id: 'track-2', title: 'Next song' }],
        },
        lyrics: {
          trackId: 'track-1',
          source: { filename: 'song.lrc', language: 'ja' },
          lines: [{ text: '夜に駆ける', start: 2, end: 4 }],
          activeLineIndex: 0,
          offsetSave: {
            isSaving: true,
            error: '同步調整未儲存，請再試一次。',
          },
        },
        readings: {
          lines: [
            {
              text: '夜に駆ける',
              romaji: 'yoru ni kakeru',
              segments: [{ t: '夜', r: 'よる' }, { t: 'に駆ける' }],
            },
          ],
        },
      },
      { revision: 3, generatedAt: '2026-08-22T00:00:00.000Z' },
    );

    expect(result).toMatchObject({
      version: 2,
      state: {
        revision: 3,
        displayDelayMs: 0,
        playback: { status: 'playing', positionMs: 2500, rate: 0.9 },
        queue: { items: [{ state: 'current' }, { state: 'queued' }] },
      },
      adjustments: {
        transposeSemitones: -2,
        pitchCents: 15,
        tempoRate: 0.9,
      },
      readings: {
        trackId: 'track-1',
        lines: [
          {
            text: '夜に駆ける',
            romaji: 'yoru ni kakeru',
            segments: [{ text: '夜', reading: 'よる' }, { text: 'に駆ける' }],
          },
        ],
      },
      controls: {
        lyricsOffset: {
          available: true,
          saving: true,
          error: '同步調整未儲存，請再試一次。',
        },
      },
    });
  });

  it('drops stale reading lines instead of pairing them with new lyrics', () => {
    const result = projectPerformerSnapshot({
      player: { track: { id: 'track-1', title: 'Song' } },
      lyrics: {
        trackId: 'track-1',
        lines: [{ text: 'new text' }],
        activeLineIndex: -1,
      },
      readings: { lines: [{ text: 'old text', romaji: 'stale' }] },
    });

    expect(result.readings.lines).toEqual([null]);
  });

  it('fails closed when the active lyrics source cannot own an offset', () => {
    const result = projectPerformerSnapshot({
      player: { track: { id: 'track-1', title: 'Song' } },
      lyrics: {
        trackId: 'track-1',
        source: null,
        lines: [{ text: 'line' }],
        offsetSave: { isSaving: true, error: 'private failure' },
      },
    });

    expect(result.controls.lyricsOffset).toEqual({
      available: false,
      saving: false,
      error: '',
    });
  });
});

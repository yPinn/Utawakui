import { describe, expect, it } from 'vitest';
import { projectPerformerSnapshot } from './performerSnapshot.js';

describe('projectPerformerSnapshot', () => {
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
          lines: [{ text: '夜に駆ける', start: 2, end: 4 }],
          activeLineIndex: 0,
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
      version: 1,
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
});

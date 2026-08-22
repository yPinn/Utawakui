import { describe, expect, it } from 'vitest';
import {
  projectDynamicOutputState,
  projectLyricsOutputDocument,
  projectQueueOutputDocument,
} from './outputStreamProjection.js';

describe('output stream projection', () => {
  it('projects canonical T2 lyrics without source filenames or private fields', () => {
    const document = projectLyricsOutputDocument({
      trackId: 'track-1',
      source: {
        filename: 'main.ja.lrc',
        language: 'ja',
        kind: 'manual',
        privatePath: 'C:\\secret.lrc',
      },
      document: {
        documentId: 'lyrics-1',
        granularity: 'T2',
        lines: [
          {
            lineId: 'line-1',
            text: '歌詞',
            startMs: 1000,
            endMs: 2000,
            segments: [
              {
                segmentId: 'segment-1',
                text: '歌詞',
                startMs: 1000,
                endMs: 2000,
              },
            ],
          },
        ],
      },
    });

    expect(document).toEqual({
      documentId: 'lyrics-1',
      trackId: 'track-1',
      granularity: 'T2',
      source: { language: 'ja', kind: 'manual' },
      lines: [
        {
          lineId: 'line-1',
          text: '歌詞',
          startMs: 1000,
          endMs: 2000,
          segments: [
            {
              segmentId: 'segment-1',
              text: '歌詞',
              startMs: 1000,
              endMs: 2000,
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(document)).not.toContain('filename');
  });

  it('projects bounded queue content under a stable document id', () => {
    expect(
      projectQueueOutputDocument({
        sourceName: 'Set',
        historyEntries: [],
        currentTrack: { id: 'track-1', title: 'Song' },
        upcomingTracks: [{ id: 'track-2', title: 'Next' }],
      }),
    ).toEqual({
      documentId: 'queue-current',
      sourceName: 'Set',
      items: [
        { state: 'current', track: { id: 'track-1', title: 'Song' } },
        { state: 'queued', track: { id: 'track-2', title: 'Next' } },
      ],
    });
  });

  it('keeps dynamic clock state small and references immutable documents', () => {
    const state = projectDynamicOutputState(
      {
        player: {
          track: { id: 'track-1', title: 'Song' },
          playbackPhase: 'playing',
          currentTime: 1.25,
          duration: 180,
          tempoRate: 1,
        },
        output: { displayDelayMs: 300 },
        lyrics: {
          offsetSeconds: 0.1,
          activeLineId: 'line-1',
          activeSegmentId: 'segment-1',
          reference: { documentId: 'lyrics-1', documentRevision: 4 },
        },
        queue: {
          reference: { documentId: 'queue-current', documentRevision: 7 },
        },
      },
      { generatedAt: '2026-08-23T00:00:00.000Z' },
    );

    expect(state).toMatchObject({
      generatedAt: '2026-08-23T00:00:00.000Z',
      displayDelayMs: 300,
      playback: { positionMs: 1250, track: { id: 'track-1' } },
      lyrics: {
        documentId: 'lyrics-1',
        documentRevision: 4,
        offsetMs: 100,
        activeLineId: 'line-1',
        activeSegmentId: 'segment-1',
      },
      queue: { documentId: 'queue-current', documentRevision: 7 },
    });
    expect(state).not.toHaveProperty('lyrics.lines');
    expect(state).not.toHaveProperty('queue.items');
  });

  it('uses a null lyrics reference when the active track has no document', () => {
    expect(
      projectDynamicOutputState({
        player: {},
        lyrics: { reference: null },
        queue: {
          reference: { documentId: 'queue-current', documentRevision: 1 },
        },
      }).lyrics,
    ).toMatchObject({ documentId: null, documentRevision: 0 });
  });
});

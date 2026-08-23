import { describe, expect, it } from 'vitest';
import {
  projectDynamicOutputState,
  projectLyricsOutputDocument,
  projectMusicStructureOutputDocument,
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

  it('projects only current M1/M2 cues under the audio source revision', () => {
    const document = projectMusicStructureOutputDocument({
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      signals: {
        level: 'M2',
        reason: 'current',
        tempo: { bpm: 120, confidence: 0.82, privateModel: 'hidden' },
        beats: [
          {
            timeMs: 500,
            positionInBar: 1,
            downbeat: true,
            confidence: 0.9,
            privateLabel: 'hidden',
          },
        ],
        sections: [
          {
            sectionId: 'section_1',
            startMs: 0,
            endMs: 10000,
            role: 'chorus',
            confidence: 0.76,
            rawLabel: 'Chorus A',
          },
        ],
      },
    });

    expect(document).toEqual({
      documentId: `music-structure-${'a'.repeat(64)}`,
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      level: 'M2',
      tempo: { bpm: 120, confidence: 0.82 },
      beats: [
        {
          timeMs: 500,
          positionInBar: 1,
          downbeat: true,
          confidence: 0.9,
        },
      ],
      sections: [
        {
          sectionId: 'section_1',
          startMs: 0,
          endMs: 10000,
          role: 'chorus',
          confidence: 0.76,
        },
      ],
    });
    expect(JSON.stringify(document)).not.toContain('private');
    expect(JSON.stringify(document)).not.toContain('rawLabel');
  });

  it.each([
    ['missing signals', null],
    ['stale signals', { level: 'M2', reason: 'stale' }],
    ['M0 fallback', { level: 'M0', reason: 'no-signal' }],
  ])('keeps %s out of Output cue transport', (_label, signals) => {
    expect(
      projectMusicStructureOutputDocument({
        trackId: 'track-1',
        sourceRevision: 'a'.repeat(64),
        sourceDurationMs: 180000,
        signals,
      }),
    ).toBeNull();
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
        musicStructure: {
          reference: {
            documentId: `music-structure-${'a'.repeat(64)}`,
            documentRevision: 2,
          },
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
      musicStructure: {
        documentId: `music-structure-${'a'.repeat(64)}`,
        documentRevision: 2,
      },
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

  it('uses a null music-structure reference for the M0 fallback', () => {
    expect(
      projectDynamicOutputState({
        player: {},
        musicStructure: { reference: null },
      }).musicStructure,
    ).toEqual({ documentId: null, documentRevision: 0 });
  });
});

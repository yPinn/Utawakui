import { describe, expect, it } from 'vitest';
import {
  deriveLyricsPlaybackState,
  normalizeLyricsDocument,
  projectLegacyLyricLines,
} from './lyricsDocument.js';

const SOURCE = {
  filename: 'main.lrc',
  language: 'und',
  kind: 'manual',
};
const SOURCE_FINGERPRINT = 'a'.repeat(64);
const NORMALIZER_PROFILE_ID = 'lyrics-source-v1';

function normalize(text, options = {}) {
  return normalizeLyricsDocument({
    text,
    source: SOURCE,
    sourceFingerprint: SOURCE_FINGERPRINT,
    normalizerProfileId: NORMALIZER_PROFILE_ID,
    timing: { status: 'missing' },
    ...options,
  });
}

describe('normalizeLyricsDocument', () => {
  it('normalizes timed LRC into stable millisecond identities', () => {
    const text = '[00:01.25]Repeat\n[00:03.50]Repeat';
    const first = normalize(text);
    const second = normalize(text);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      schemaVersion: 1,
      normalizerProfileId: NORMALIZER_PROFILE_ID,
      source: { filename: 'main.lrc', sha256: SOURCE_FINGERPRINT },
      granularity: 'T1',
      lines: [
        { text: 'Repeat', startMs: 1250, endMs: 3500 },
        { text: 'Repeat', startMs: 3500, endMs: null },
      ],
    });
    expect(first.lines[0].lineId).not.toBe(first.lines[1].lineId);
    expect(first.documentId).toMatch(/^lyr_/);
  });

  it('normalizes untimed text without NaN or Infinity', () => {
    const document = normalize('First line\nSecond line');

    expect(document.granularity).toBe('T0');
    expect(document.lines).toEqual([
      expect.objectContaining({
        text: 'First line',
        startMs: null,
        endMs: null,
      }),
      expect.objectContaining({
        text: 'Second line',
        startMs: null,
        endMs: null,
      }),
    ]);
    expect(JSON.stringify(document)).not.toMatch(/NaN|Infinity/);
  });

  it('imports partial Enhanced LRC as validated canonical T2 segments', () => {
    const document = normalize(
      `[00:01.00]<00:01.00>Hello <00:01.50>world<00:02.00>
[00:03.00]Plain fallback`,
    );

    expect(document.granularity).toBe('T2');
    expect(document.lines[0]).toMatchObject({
      text: 'Hello world',
      startMs: 1000,
      endMs: 3000,
      segments: [
        { text: 'Hello ', startMs: 1000, endMs: 1500 },
        { text: 'world', startMs: 1500, endMs: 2000 },
      ],
    });
    expect(document.lines[0].segments[0].segmentId).toMatch(
      new RegExp(`^${document.lines[0].lineId}_s_`),
    );
    expect(document.lines[1]).not.toHaveProperty('segments');
    expect(JSON.stringify(document)).not.toMatch(/NaN|Infinity/);
  });

  it('changes derived identity when the source or normalizer profile changes', () => {
    const base = normalize('[00:01.00]Hello');
    const changedSource = normalize('[00:01.00]Hello', {
      sourceFingerprint: 'b'.repeat(64),
    });
    const changedProfile = normalize('[00:01.00]Hello', {
      normalizerProfileId: 'lyrics-source-v2',
    });

    expect(changedSource.documentId).not.toBe(base.documentId);
    expect(changedProfile.documentId).not.toBe(base.documentId);
  });

  it('uses only a current validated sidecar document', () => {
    const currentDocument = {
      schemaVersion: 1,
      documentId: 'saved_document',
      normalizerProfileId: NORMALIZER_PROFILE_ID,
      source: { filename: 'main.lrc', sha256: SOURCE_FINGERPRINT },
      granularity: 'T2',
      lines: [
        {
          lineId: 'saved_line',
          text: 'Saved',
          startMs: 1000,
          endMs: 2000,
          segments: [
            {
              segmentId: 'saved_segment',
              text: 'Saved',
              startMs: 1000,
              endMs: 2000,
            },
          ],
        },
      ],
    };

    expect(
      normalize('[00:01.00]Fallback', {
        timing: { status: 'current', document: currentDocument },
      }),
    ).toEqual(currentDocument);
    expect(
      normalize('[00:01.00]Fallback', {
        timing: { status: 'stale', document: currentDocument },
      }).documentId,
    ).not.toBe('saved_document');
  });
});

describe('deriveLyricsPlaybackState', () => {
  const document = normalize(
    `[00:01.00]<00:01.00>Hello <00:01.50>world<00:02.00>
[00:03.00]Plain fallback`,
  );

  it('derives active line, segment, and bounded progress from one position', () => {
    expect(deriveLyricsPlaybackState(document, 1250)).toMatchObject({
      activeLineId: document.lines[0].lineId,
      activeLineIndex: 0,
      activeSegmentId: document.lines[0].segments[0].segmentId,
      activeSegmentIndex: 0,
      activeSegmentProgress: 0.5,
    });
  });

  it('keeps the line active without fabricating segment progress in a gap', () => {
    expect(deriveLyricsPlaybackState(document, 2500)).toEqual({
      activeLineId: document.lines[0].lineId,
      activeLineIndex: 0,
      activeLineProgress: 0.75,
      activeSegmentId: null,
      activeSegmentIndex: -1,
      activeSegmentProgress: null,
    });
  });

  it('uses playable duration for an open final line and otherwise leaves progress null', () => {
    expect(deriveLyricsPlaybackState(document, 3500)).toMatchObject({
      activeLineId: document.lines[1].lineId,
      activeLineProgress: null,
    });
    expect(deriveLyricsPlaybackState(document, 3500, 5000)).toMatchObject({
      activeLineId: document.lines[1].lineId,
      activeLineProgress: 0.25,
    });
  });
});

describe('projectLegacyLyricLines', () => {
  it('preserves the current seconds-based line consumer contract', () => {
    const document = normalize('[00:01.25]First\n[00:03.50]Second');

    expect(projectLegacyLyricLines(document)).toEqual([
      {
        lineId: document.lines[0].lineId,
        text: 'First',
        start: 1.25,
        end: 3.5,
      },
      {
        lineId: document.lines[1].lineId,
        text: 'Second',
        start: 3.5,
        end: Number.POSITIVE_INFINITY,
      },
    ]);
  });
});

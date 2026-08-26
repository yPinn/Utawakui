import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import lyricsTimingModule from './lyricsTiming.js';

const {
  LYRICS_NORMALIZER_PROFILE_ID,
  LYRICS_TIMING_SCHEMA_VERSION,
  computeLyricsSourceFingerprint,
  deleteTrackLyricsTiming,
  loadTrackLyricsTiming,
  saveTrackLyricsTiming,
  timingSidecarPath,
  validateLyricsTimingDocument,
} = lyricsTimingModule;

function createDocument(sourceSha256, overrides = {}) {
  return {
    schemaVersion: LYRICS_TIMING_SCHEMA_VERSION,
    documentId: 'lyr_document_01',
    normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
    source: {
      filename: 'main.lrc',
      sha256: sourceSha256,
    },
    lines: [
      {
        lineId: 'line_01',
        text: 'Hello world',
        startMs: 1000,
        endMs: null,
      },
    ],
    ...overrides,
  };
}

describe('lyrics timing sidecars', () => {
  let dir;
  let trackDir;
  let lyricsDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-lyrics-timing-'));
    trackDir = path.join(dir, 'tracks', 'track-a');
    lyricsDir = path.join(trackDir, 'lyrics');
    fs.mkdirSync(lyricsDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
    fs.writeFileSync(path.join(lyricsDir, 'main.lrc'), '[00:01.00]Hello world');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('hashes exact source bytes and resolves only allowlisted sidecar paths', () => {
    const first = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    const second = computeLyricsSourceFingerprint(trackDir, 'main.lrc');

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(timingSidecarPath(trackDir, 'main.lrc')).toBe(
      path.join(lyricsDir, 'timing', 'main.lrc.json'),
    );
    expect(timingSidecarPath(trackDir, '../main.lrc')).toBe(null);
    expect(computeLyricsSourceFingerprint(trackDir, '../main.lrc')).toBe(null);
  });

  it('atomically saves and loads a current partial timing document', () => {
    const sourceSha256 = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    const document = createDocument(sourceSha256, {
      lines: [
        {
          lineId: 'line_01',
          text: 'Hello world',
          startMs: 1000,
          endMs: 3000,
          segments: [
            {
              segmentId: 'segment_01',
              text: 'Hello ',
              startMs: 1000,
              endMs: 1900,
            },
            {
              segmentId: 'segment_02',
              text: 'world',
              startMs: 1900,
              endMs: null,
            },
          ],
        },
        {
          lineId: 'line_02',
          text: 'Untimed fallback',
          startMs: null,
          endMs: null,
        },
      ],
    });

    const saved = saveTrackLyricsTiming(
      trackDir,
      'main.lrc',
      sourceSha256,
      document,
    );

    expect(saved).toMatchObject({
      status: 'current',
      sourceFingerprint: sourceSha256,
      normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
      document: { granularity: 'T2' },
    });
    expect(loadTrackLyricsTiming(trackDir, 'main.lrc')).toEqual(saved);
  });

  it('atomically replaces an existing valid sidecar', () => {
    const sourceSha256 = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    saveTrackLyricsTiming(
      trackDir,
      'main.lrc',
      sourceSha256,
      createDocument(sourceSha256),
    );

    const saved = saveTrackLyricsTiming(
      trackDir,
      'main.lrc',
      sourceSha256,
      createDocument(sourceSha256, {
        lines: [
          {
            lineId: 'line_01',
            text: 'Hello world',
            startMs: 2500,
            endMs: null,
          },
        ],
      }),
    );

    expect(saved.document.lines[0].startMs).toBe(2500);
    expect(loadTrackLyricsTiming(trackDir, 'main.lrc')).toEqual(saved);
  });

  it('reports a saved document as stale after source bytes change', () => {
    const sourceSha256 = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    saveTrackLyricsTiming(
      trackDir,
      'main.lrc',
      sourceSha256,
      createDocument(sourceSha256),
    );

    fs.writeFileSync(path.join(lyricsDir, 'main.lrc'), '[00:02.00]Changed');

    const loaded = loadTrackLyricsTiming(trackDir, 'main.lrc');
    expect(loaded.status).toBe('stale');
    expect(loaded.document).toBeUndefined();
    expect(loaded.sourceFingerprint).not.toBe(sourceSha256);
  });

  it('reports a v1 sidecar as stale so inferred-end provenance is regenerated', () => {
    const sourceSha256 = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    const sidecarPath = timingSidecarPath(trackDir, 'main.lrc');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify(
        createDocument(sourceSha256, {
          normalizerProfileId: 'lyrics-source-v1',
        }),
      ),
    );

    expect(loadTrackLyricsTiming(trackDir, 'main.lrc')).toMatchObject({
      status: 'stale',
      sourceFingerprint: sourceSha256,
      normalizerProfileId: 'lyrics-source-v2',
    });
  });

  it('retains timing and reports unavailable when the source disappears', () => {
    const sourceSha256 = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    saveTrackLyricsTiming(
      trackDir,
      'main.lrc',
      sourceSha256,
      createDocument(sourceSha256),
    );
    const sidecarPath = timingSidecarPath(trackDir, 'main.lrc');

    fs.unlinkSync(path.join(lyricsDir, 'main.lrc'));

    expect(loadTrackLyricsTiming(trackDir, 'main.lrc')).toMatchObject({
      status: 'unavailable',
      sourceFingerprint: null,
    });
    expect(fs.existsSync(sidecarPath)).toBe(true);
  });

  it('preserves and reports corrupt and unsupported sidecars', () => {
    const sidecarPath = timingSidecarPath(trackDir, 'main.lrc');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(sidecarPath, '{broken');

    expect(loadTrackLyricsTiming(trackDir, 'main.lrc').status).toBe('corrupt');
    expect(fs.readFileSync(sidecarPath, 'utf8')).toBe('{broken');

    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({ schemaVersion: 999, lines: [] }),
    );
    expect(loadTrackLyricsTiming(trackDir, 'main.lrc').status).toBe(
      'unsupported',
    );
    expect(JSON.parse(fs.readFileSync(sidecarPath, 'utf8')).schemaVersion).toBe(
      999,
    );
  });

  it('rejects saves when the source changed concurrently', () => {
    const sourceSha256 = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    const document = createDocument(sourceSha256);
    fs.writeFileSync(path.join(lyricsDir, 'main.lrc'), '[00:02.00]Changed');

    expect(() =>
      saveTrackLyricsTiming(trackDir, 'main.lrc', sourceSha256, document),
    ).toThrow(/changed/i);
    expect(fs.existsSync(timingSidecarPath(trackDir, 'main.lrc'))).toBe(false);
  });

  it('keeps the previous valid sidecar when replacement validation fails', () => {
    const sourceSha256 = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    const original = saveTrackLyricsTiming(
      trackDir,
      'main.lrc',
      sourceSha256,
      createDocument(sourceSha256),
    );
    const oversized = createDocument(sourceSha256, {
      lines: [
        {
          lineId: 'line_01',
          text: 'x'.repeat(2001),
          startMs: 1000,
          endMs: null,
        },
      ],
    });

    expect(() =>
      saveTrackLyricsTiming(trackDir, 'main.lrc', sourceSha256, oversized),
    ).toThrow(/text/i);
    expect(loadTrackLyricsTiming(trackDir, 'main.lrc')).toEqual(original);
  });

  it('deletes only the requested source timing sidecar', () => {
    const sourceSha256 = computeLyricsSourceFingerprint(trackDir, 'main.lrc');
    saveTrackLyricsTiming(
      trackDir,
      'main.lrc',
      sourceSha256,
      createDocument(sourceSha256),
    );
    const otherPath = path.join(lyricsDir, 'timing', 'other.lrc.json');
    fs.writeFileSync(otherPath, '{}');

    expect(deleteTrackLyricsTiming(trackDir, 'main.lrc')).toBe(true);
    expect(fs.existsSync(timingSidecarPath(trackDir, 'main.lrc'))).toBe(false);
    expect(fs.existsSync(otherPath)).toBe(true);
  });
});

describe('validateLyricsTimingDocument', () => {
  const sourceSha256 = 'a'.repeat(64);
  const options = {
    sourceFilename: 'main.lrc',
    sourceSha256,
    normalizerProfileId: 'lyrics-source-v2',
  };

  it('derives T0, T1, and T2 granularity from validated content', () => {
    const t0 = validateLyricsTimingDocument(
      createDocument(sourceSha256, {
        lines: [
          {
            lineId: 'line_01',
            text: 'Untimed',
            startMs: null,
            endMs: null,
          },
        ],
      }),
      options,
    );
    const t1 = validateLyricsTimingDocument(
      createDocument(sourceSha256),
      options,
    );
    const t2 = validateLyricsTimingDocument(
      createDocument(sourceSha256, {
        lines: [
          {
            lineId: 'line_01',
            text: 'Hello world',
            startMs: 1000,
            endMs: 3000,
            segments: [
              {
                segmentId: 'segment_01',
                text: 'Hello world',
                startMs: 1000,
                endMs: null,
              },
            ],
          },
        ],
      }),
      options,
    );

    expect(t0.granularity).toBe('T0');
    expect(t1.granularity).toBe('T1');
    expect(t2.granularity).toBe('T2');
  });

  it('preserves a validated next-line inferred end boundary', () => {
    const document = validateLyricsTimingDocument(
      createDocument(sourceSha256, {
        lines: [
          {
            lineId: 'line_01',
            text: 'First',
            startMs: 1000,
            endMs: 3000,
            endInferred: true,
          },
          {
            lineId: 'line_02',
            text: 'Second',
            startMs: 3000,
            endMs: null,
          },
        ],
      }),
      options,
    );

    expect(document.lines[0]).toMatchObject({
      endMs: 3000,
      endInferred: true,
    });
  });

  it.each([
    [
      'duplicate line ids',
      {
        lines: [
          { lineId: 'same', text: 'A', startMs: null, endMs: null },
          { lineId: 'same', text: 'B', startMs: null, endMs: null },
        ],
      },
    ],
    [
      'non-finite time',
      {
        lines: [
          {
            lineId: 'line_01',
            text: 'A',
            startMs: Number.POSITIVE_INFINITY,
            endMs: null,
          },
        ],
      },
    ],
    [
      'negative time',
      { lines: [{ lineId: 'line_01', text: 'A', startMs: -1, endMs: null }] },
    ],
    [
      'invalid inferred end provenance',
      {
        lines: [
          {
            lineId: 'line_01',
            text: 'First',
            startMs: 1000,
            endMs: 2500,
            endInferred: true,
          },
          {
            lineId: 'line_02',
            text: 'Second',
            startMs: 3000,
            endMs: null,
          },
        ],
      },
    ],
    [
      'untimed inferred end provenance',
      {
        lines: [
          {
            lineId: 'line_01',
            text: 'First',
            startMs: null,
            endMs: null,
            endInferred: true,
          },
          {
            lineId: 'line_02',
            text: 'Second',
            startMs: null,
            endMs: null,
          },
        ],
      },
    ],
    [
      'mismatched segment text',
      {
        lines: [
          {
            lineId: 'line_01',
            text: 'Hello world',
            startMs: 1000,
            endMs: 3000,
            segments: [
              {
                segmentId: 'segment_01',
                text: 'Wrong',
                startMs: 1000,
                endMs: 2000,
              },
            ],
          },
        ],
      },
    ],
    [
      'segment outside parent',
      {
        lines: [
          {
            lineId: 'line_01',
            text: 'Hello world',
            startMs: 1000,
            endMs: 3000,
            segments: [
              {
                segmentId: 'segment_01',
                text: 'Hello world',
                startMs: 500,
                endMs: 2000,
              },
            ],
          },
        ],
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(() =>
      validateLyricsTimingDocument(
        createDocument(sourceSha256, overrides),
        options,
      ),
    ).toThrow();
  });

  it('rejects source identity supplied for a different file or hash', () => {
    expect(() =>
      validateLyricsTimingDocument(createDocument(sourceSha256), {
        ...options,
        sourceFilename: 'other.lrc',
      }),
    ).toThrow(/source/i);
    expect(() =>
      validateLyricsTimingDocument(createDocument(sourceSha256), {
        ...options,
        sourceSha256: 'b'.repeat(64),
      }),
    ).toThrow(/source/i);
  });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteStoredLrclibSource,
  fingerprintLrclibRecord,
  saveLrclibRecord,
} from './storage.js';
import { loadTrackLyricsTiming } from '../library/lyricsTiming.js';
import {
  deleteLyricsSource,
  listTrackLyricsSources,
  saveTrackLyricsText,
} from '../library/lyrics.js';

function record(overrides = {}) {
  return {
    id: 42,
    name: 'Song - Artist',
    trackName: 'Song',
    artistName: 'Artist',
    albumName: 'Album',
    duration: 180,
    instrumental: false,
    plainLyrics: 'Hello world\nAgain',
    syncedLyrics: '[00:01.000]Hello world\n[00:03.000]Again',
    lyricsfile: `version: "1.0"
metadata:
  title: Song
  artist: Artist
  album: Album
  duration_ms: 180000
  language: en
lines:
  - text: Hello world
    start_ms: 1000
    end_ms: 2000
    words:
      - text: Hello
        start_ms: 1000
        end_ms: 1400
      - text: " world"
        start_ms: 1400
        end_ms: 2000
  - text: Again
    start_ms: 3000
    end_ms: 4000
    words:
      - text: Again
        start_ms: 3000
        end_ms: 4000
plain: |-
  Hello world
  Again
`,
    ...overrides,
  };
}

describe('LRCLIB provider storage', () => {
  let rootDir;
  let trackDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-lrclib-store-'));
    trackDir = path.join(rootDir, 'tracks', 'track');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('stores the complete provider artifact, compatibility LRC, and canonical T2 sidecar', () => {
    const fetched = record();
    const saved = saveLrclibRecord(trackDir, fetched, {
      retrievedAt: '2026-08-23T10:00:00.000Z',
    });

    expect(saved).toMatchObject({
      status: 'saved',
      source: {
        filename: 'lrclib-42.lrc',
        language: 'en',
        kind: 'lrclib',
        label: 'Album',
      },
      capability: { level: 'T2', partial: false },
      compatibility: { t0: true, t1: true, t2: true },
    });
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'lrclib-42.lrc'), 'utf8'),
    ).toBe('[00:01.000]Hello world\n[00:03.000]Again\n');

    const artifact = JSON.parse(
      fs.readFileSync(
        path.join(trackDir, 'lyrics', 'providers', 'lrclib-42.json'),
        'utf8',
      ),
    );
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      provider: 'lrclib',
      providerRecordId: 42,
      retrievedAt: '2026-08-23T10:00:00.000Z',
      record: fetched,
      capability: { level: 'T2', partial: false },
      compatibility: { t0: true, t1: true, t2: true },
      hashes: {
        record: expect.stringMatching(/^[a-f0-9]{64}$/),
        lyricsfile: expect.stringMatching(/^[a-f0-9]{64}$/),
        compatibilitySource: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });

    const timing = loadTrackLyricsTiming(trackDir, 'lrclib-42.lrc');
    expect(timing).toMatchObject({
      status: 'current',
      document: {
        documentId: 'lrclib:42',
        granularity: 'T2',
      },
    });
    expect(timing.document.lines[0]).toEqual({
      lineId: 'line:0',
      text: 'Hello world',
      startMs: 1000,
      endMs: 2000,
      segments: [
        {
          segmentId: 'line:0:word:0',
          text: 'Hello',
          startMs: 1000,
          endMs: 1400,
        },
        {
          segmentId: 'line:0:word:1',
          text: ' world',
          startMs: 1400,
          endMs: 2000,
        },
      ],
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'lyrics.json'), 'utf8'),
    );
    expect(manifest.sources).toContainEqual(
      expect.objectContaining({
        filename: 'lrclib-42.lrc',
        provider: {
          name: 'lrclib',
          recordId: 42,
          artifactFilename: 'lrclib-42.json',
        },
      }),
    );
  });

  it('is idempotent by provider id and updates rather than duplicating the source', () => {
    const first = saveLrclibRecord(trackDir, record());
    const secondRecord = record({
      albumName: 'Updated Album',
      syncedLyrics: '[00:01.000]Updated',
      lyricsfile: null,
      plainLyrics: 'Updated',
    });
    const second = saveLrclibRecord(trackDir, secondRecord);

    expect(second.source.filename).toBe(first.source.filename);
    expect(listTrackLyricsSources(trackDir).sources).toEqual([
      expect.objectContaining({
        filename: 'lrclib-42.lrc',
        label: 'Updated Album',
      }),
    ]);
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'lrclib-42.lrc'), 'utf8'),
    ).toBe('[00:01.000]Updated');
    expect(loadTrackLyricsTiming(trackDir, 'lrclib-42.lrc').status).toBe(
      'missing',
    );
  });

  it('restores the previously published record when manifest publication fails', () => {
    saveLrclibRecord(trackDir, record());
    const paths = [
      path.join(trackDir, 'lyrics', 'lrclib-42.lrc'),
      path.join(trackDir, 'lyrics', 'providers', 'lrclib-42.json'),
      path.join(trackDir, 'lyrics', 'timing', 'lrclib-42.lrc.json'),
      path.join(trackDir, 'lyrics', 'lyrics.json'),
    ];
    const before = paths.map((filePath) => fs.readFileSync(filePath));

    expect(() =>
      saveLrclibRecord(
        trackDir,
        record({ syncedLyrics: '[00:02.000]Changed', lyricsfile: null }),
        {
          publishManifest() {
            throw new Error('disk full');
          },
        },
      ),
    ).toThrow('disk full');

    expect(paths.map((filePath) => fs.readFileSync(filePath))).toEqual(before);
  });

  it('retains T1 and T0 compatibility without claiming T2', () => {
    const t1 = saveLrclibRecord(
      trackDir,
      record({
        id: 10,
        lyricsfile: `version: "1.0"
metadata:
  title: Song
  artist: Artist
lines:
  - text: Line only
    start_ms: 1500
plain: Line only
`,
      }),
    );
    const t0 = saveLrclibRecord(
      trackDir,
      record({
        id: 11,
        syncedLyrics: null,
        lyricsfile: null,
        plainLyrics: 'Plain only',
      }),
    );

    expect(t1.capability.level).toBe('T1');
    expect(t1.timing.status).toBe('missing');
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'lrclib-10.lrc'), 'utf8'),
    ).toBe('[00:01.500]Line only\n');
    expect(t0.capability.level).toBe('T0');
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'lrclib-11.lrc'), 'utf8'),
    ).toBe('Plain only');
  });

  it('preserves unsupported provider content without publishing a false source', () => {
    const saved = saveLrclibRecord(
      trackDir,
      record({
        syncedLyrics: null,
        plainLyrics: null,
        lyricsfile: `version: "2.0"
metadata:
  title: Song
  artist: Artist
`,
      }),
    );

    expect(saved).toMatchObject({
      status: 'preserved',
      source: null,
      capability: { level: 'unsupported' },
    });
    expect(
      fs.existsSync(
        path.join(trackDir, 'lyrics', 'providers', 'lrclib-42.json'),
      ),
    ).toBe(true);
    expect(listTrackLyricsSources(trackDir).sources).toEqual([]);
  });

  it('rejects invalid records and retrieval timestamps before publication', () => {
    expect(() => saveLrclibRecord(trackDir, record({ id: 0 }))).toThrow(
      /invalid lrclib record/i,
    );
    expect(() =>
      saveLrclibRecord(trackDir, record(), { retrievedAt: 'not-a-date' }),
    ).toThrow(/retrieval time/i);
  });

  it('deletes a provider artifact and derived sidecars but leaves legacy deletion unchanged', () => {
    const saved = saveLrclibRecord(trackDir, record());
    const readingPath = path.join(
      trackDir,
      'lyrics',
      'readings',
      `${saved.source.filename}.json`,
    );
    fs.mkdirSync(path.dirname(readingPath), { recursive: true });
    fs.writeFileSync(readingPath, '{}');

    expect(deleteStoredLrclibSource(trackDir, saved.source.filename)).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(trackDir, 'lyrics', 'providers', 'lrclib-42.json'),
      ),
    ).toBe(false);
    expect(fs.existsSync(readingPath)).toBe(false);

    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-99.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.000]Legacy',
    );
    const unrelatedArtifact = path.join(
      trackDir,
      'lyrics',
      'providers',
      'lrclib-99.json',
    );
    fs.mkdirSync(path.dirname(unrelatedArtifact), { recursive: true });
    fs.writeFileSync(unrelatedArtifact, '{}');

    expect(deleteLyricsSource(trackDir, 'lrclib-99.lrc')).toBe(true);
    expect(fs.existsSync(unrelatedArtifact)).toBe(true);
    expect(deleteStoredLrclibSource(trackDir, 'missing.lrc')).toBe(false);
  });
});

describe('fingerprintLrclibRecord', () => {
  it('is stable for a normalized record and changes with provider content', () => {
    expect(fingerprintLrclibRecord(record())).toBe(
      fingerprintLrclibRecord(record()),
    );
    expect(
      fingerprintLrclibRecord(record({ plainLyrics: 'Changed' })),
    ).not.toBe(fingerprintLrclibRecord(record()));
    expect(() => fingerprintLrclibRecord(record({ id: -1 }))).toThrow(
      /invalid lrclib record/i,
    );
  });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listTrackLyricsSources } from '../library/lyrics.js';
import { loadTrackLyricsTiming } from '../library/lyricsTiming.js';
import {
  deleteStoredNeteaseSource,
  loadStoredNeteaseArtifactSummary,
  saveNeteaseRecord,
} from './storage.js';

function record(overrides = {}) {
  return {
    id: 42,
    trackName: 'Song',
    artistName: 'Artist',
    artists: ['Artist'],
    albumName: 'Album',
    duration: 180,
    aliases: [],
    translatedTitles: [],
    yrcLyrics: [
      '[1000,2000](1000,500,0)Hello(1500,1500,0) world',
      '[4000,1000](4000,1000,0)Again',
    ].join('\n'),
    lrcLyrics: '[00:01.000]Hello world\n[00:04.000]Again',
    ...overrides,
  };
}

describe('NetEase provider storage', () => {
  let rootDir;
  let trackDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-netease-'));
    trackDir = path.join(rootDir, 'tracks', 'track');
    fs.mkdirSync(trackDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('atomically stores provenance, compatibility lyrics and canonical T2 timing', () => {
    const saved = saveNeteaseRecord(trackDir, record(), {
      retrievedAt: '2026-08-29T12:00:00.000Z',
    });

    expect(saved).toMatchObject({
      status: 'saved',
      source: {
        filename: 'netease-42.lrc',
        language: 'und',
        kind: 'netease',
        label: 'Album',
      },
      capability: { level: 'T2', partial: false },
      compatibility: { t0: true, t1: true, t2: true },
    });
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'netease-42.lrc'), 'utf8'),
    ).toBe('[00:01.000]Hello world\n[00:04.000]Again\n');
    const timing = loadTrackLyricsTiming(trackDir, 'netease-42.lrc');
    expect(timing).toMatchObject({
      status: 'current',
      document: { granularity: 'T2', documentId: 'netease:42' },
    });
    expect(timing.document.lines[0]).toMatchObject({
      text: 'Hello world',
      segments: [
        { text: 'Hello', startMs: 1000, endMs: 1500 },
        { text: ' world', startMs: 1500, endMs: 3000 },
      ],
    });
    expect(listTrackLyricsSources(trackDir)).toMatchObject({
      sources: [
        {
          filename: 'netease-42.lrc',
          kind: 'netease',
          label: 'Album',
        },
      ],
    });

    const source = JSON.parse(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'lyrics.json'), 'utf8'),
    ).sources[0];
    expect(source.provider).toEqual({
      name: 'netease',
      recordId: 42,
      artifactFilename: 'netease-42.json',
    });
    expect(loadStoredNeteaseArtifactSummary(trackDir, source.provider)).toEqual(
      {
        recordFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        retrievedAt: '2026-08-29T12:00:00.000Z',
      },
    );
  });

  it('stores line timing without a forged T2 sidecar when YRC is absent', () => {
    const saved = saveNeteaseRecord(
      trackDir,
      record({ yrcLyrics: '', lrcLyrics: '[00:01.000]Line' }),
    );

    expect(saved).toMatchObject({
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true, t2: false },
    });
    expect(loadTrackLyricsTiming(trackDir, 'netease-42.lrc').status).toBe(
      'missing',
    );
  });

  it('deletes the provider artifact with the selected source', () => {
    const saved = saveNeteaseRecord(trackDir, record());
    expect(deleteStoredNeteaseSource(trackDir, saved.source.filename)).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(trackDir, 'lyrics', 'providers', 'netease-42.json'),
      ),
    ).toBe(false);
    expect(listTrackLyricsSources(trackDir).sources).toEqual([]);
  });
});

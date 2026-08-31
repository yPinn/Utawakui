import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadTrackLyricsManifest } from '../library/lyrics.js';
import { loadTrackLyricsTiming } from '../library/lyricsTiming.js';
import {
  deleteStoredBetterLyricsSource,
  loadStoredBetterLyricsArtifactSummary,
  saveBetterLyricsRecord,
} from './storage.js';

const TTML = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions" itunes:timing="Word"><body dur="5s"><p begin="1s" end="3s"><span begin="1s" end="1.5s">Hello</span> <span begin="1.5s" end="3s">world</span></p></body></tt>`;

function record(overrides = {}) {
  return {
    id: 42,
    trackName: 'Song',
    artistName: 'Singer',
    albumName: 'Album',
    duration: 5,
    score: 95,
    cacheStatus: 'HIT',
    ttml: TTML,
    ...overrides,
  };
}

describe('Better Lyrics storage', () => {
  let rootDir;
  let trackDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-betterlyrics-'));
    trackDir = path.join(rootDir, 'tracks', 'track-1');
    fs.mkdirSync(trackDir, { recursive: true });
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  it('atomically saves raw TTML provenance, compatibility LRC, and T2 timing', () => {
    const result = saveBetterLyricsRecord(trackDir, record(), {
      retrievedAt: '2026-08-31T00:00:00.000Z',
    });
    expect(result).toMatchObject({
      status: 'saved',
      source: { filename: 'betterlyrics-42.lrc', kind: 'betterlyrics' },
      capability: { level: 'T2', partial: false },
    });
    expect(
      loadTrackLyricsTiming(trackDir, 'betterlyrics-42.lrc'),
    ).toMatchObject({
      status: 'current',
      document: { granularity: 'T2', documentId: 'betterlyrics:42' },
    });
    const source = loadTrackLyricsManifest(trackDir).sources[0];
    expect(source.provider).toEqual({
      name: 'betterlyrics',
      recordId: 42,
      artifactFilename: 'betterlyrics-42.json',
    });
    const artifact = JSON.parse(
      fs.readFileSync(
        path.join(trackDir, 'lyrics', 'providers', 'betterlyrics-42.json'),
        'utf8',
      ),
    );
    expect(artifact).toMatchObject({
      provider: 'betterlyrics',
      providerProfileId: 'betterlyrics-cache-http-v1',
      record: { ttml: TTML, cacheStatus: 'HIT' },
    });
    expect(
      loadStoredBetterLyricsArtifactSummary(trackDir, source.provider),
    ).toMatchObject({ retrievedAt: '2026-08-31T00:00:00.000Z' });
  });

  it('deletes the compatibility source, timing sidecar, and artifact', () => {
    saveBetterLyricsRecord(trackDir, record());
    expect(
      deleteStoredBetterLyricsSource(trackDir, 'betterlyrics-42.lrc'),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(trackDir, 'lyrics', 'providers', 'betterlyrics-42.json'),
      ),
    ).toBe(false);
    expect(loadTrackLyricsTiming(trackDir, 'betterlyrics-42.lrc').status).toBe(
      'unavailable',
    );
  });

  it('stores line timing without claiming a T2 sidecar', () => {
    const lineTtml = TTML.replace(
      'itunes:timing="Word"',
      'itunes:timing="Line"',
    ).replace(
      '<span begin="1s" end="1.5s">Hello</span> <span begin="1.5s" end="3s">world</span>',
      'Hello world',
    );
    expect(
      saveBetterLyricsRecord(trackDir, record({ ttml: lineTtml })),
    ).toMatchObject({
      status: 'saved',
      capability: { level: 'T1' },
      compatibility: { t2: false },
    });
    expect(loadTrackLyricsTiming(trackDir, 'betterlyrics-42.lrc').status).toBe(
      'missing',
    );
  });

  it('fails closed for invalid input and tampered artifact identity', () => {
    expect(() => saveBetterLyricsRecord(trackDir, record({ id: 0 }))).toThrow(
      /invalid better lyrics record/i,
    );
    expect(loadStoredBetterLyricsArtifactSummary(trackDir, null)).toBeNull();
    expect(deleteStoredBetterLyricsSource(trackDir, 'missing.lrc')).toBe(false);

    saveBetterLyricsRecord(trackDir, record());
    const storedPath = path.join(
      trackDir,
      'lyrics',
      'providers',
      'betterlyrics-42.json',
    );
    const artifact = JSON.parse(fs.readFileSync(storedPath, 'utf8'));
    artifact.record.id = 43;
    fs.writeFileSync(storedPath, JSON.stringify(artifact));
    expect(
      loadStoredBetterLyricsArtifactSummary(trackDir, {
        name: 'betterlyrics',
        recordId: 42,
        artifactFilename: 'betterlyrics-42.json',
      }),
    ).toBeNull();
  });
});

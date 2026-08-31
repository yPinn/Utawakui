import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteStoredAmllSource,
  loadStoredAmllArtifactSummary,
  saveAmllRecord,
} from './storage.js';
import { loadTrackLyricsTiming } from '../library/lyricsTiming.js';
import { loadTrackLyricsManifest } from '../library/lyrics.js';

const TTML = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions" itunes:timing="Word"><body dur="5s"><p begin="1s" end="3s"><span begin="1s" end="1.5s">Hello</span> <span begin="1.5s" end="3s">world</span></p></body></tt>`;

function record(overrides = {}) {
  return {
    id: 42,
    filename: '1700000000000-1-test.ttml',
    trackName: 'Song',
    artistName: 'Singer',
    albumName: 'Album',
    musicNames: ['Song'],
    artistNames: ['Singer'],
    albumNames: ['Album'],
    ncmMusicIds: [],
    qqMusicIds: [],
    appleMusicIds: ['123'],
    spotifyIds: [],
    isrcs: [],
    authorIds: ['1'],
    authorUsernames: ['author'],
    ttml: TTML,
    ...overrides,
  };
}

describe('AMLL storage', () => {
  let rootDir;
  let trackDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-amll-'));
    trackDir = path.join(rootDir, 'tracks', 'track-1');
    fs.mkdirSync(trackDir, { recursive: true });
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  it('atomically saves raw TTML provenance, compatibility LRC, and T2 timing', () => {
    const result = saveAmllRecord(trackDir, record(), {
      retrievedAt: '2026-08-31T00:00:00.000Z',
    });
    expect(result).toMatchObject({
      status: 'saved',
      source: { filename: 'amll-42.lrc', kind: 'amll' },
      capability: { level: 'T2', partial: false },
    });
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'amll-42.lrc'), 'utf8'),
    ).toBe('[00:01.000]Hello world\n');
    expect(loadTrackLyricsTiming(trackDir, 'amll-42.lrc')).toMatchObject({
      status: 'current',
      document: { granularity: 'T2', documentId: 'amll:42' },
    });
    const source = loadTrackLyricsManifest(trackDir).sources[0];
    expect(source.provider).toEqual({
      name: 'amll',
      recordId: 42,
      artifactFilename: 'amll-42.json',
    });
    const artifact = JSON.parse(
      fs.readFileSync(
        path.join(trackDir, 'lyrics', 'providers', 'amll-42.json'),
        'utf8',
      ),
    );
    expect(artifact).toMatchObject({
      provider: 'amll',
      providerProfileId: 'amll-http-v1',
      record: { ttml: TTML },
    });
    expect(
      loadStoredAmllArtifactSummary(trackDir, source.provider),
    ).toMatchObject({
      retrievedAt: '2026-08-31T00:00:00.000Z',
    });
  });

  it('deletes the compatibility source, timing sidecar, and provider artifact', () => {
    saveAmllRecord(trackDir, record());
    expect(deleteStoredAmllSource(trackDir, 'amll-42.lrc')).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'amll-42.lrc'))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(trackDir, 'lyrics', 'providers', 'amll-42.json')),
    ).toBe(false);
    expect(loadTrackLyricsTiming(trackDir, 'amll-42.lrc').status).toBe(
      'unavailable',
    );
  });

  it('stores line-timed TTML without claiming or retaining a T2 sidecar', () => {
    const lineTtml = TTML.replace(
      'itunes:timing="Word"',
      'itunes:timing="Line"',
    ).replace(
      '<span begin="1s" end="1.5s">Hello</span> <span begin="1.5s" end="3s">world</span>',
      'Hello world',
    );
    expect(saveAmllRecord(trackDir, record({ ttml: lineTtml }))).toMatchObject({
      status: 'saved',
      capability: { level: 'T1' },
      compatibility: { t2: false },
    });
    expect(loadTrackLyricsTiming(trackDir, 'amll-42.lrc').status).toBe(
      'missing',
    );
  });

  it('fails closed for invalid records and invalid stored artifact identity', () => {
    expect(() => saveAmllRecord(trackDir, record({ id: 0 }))).toThrow(
      /invalid amll record/i,
    );
    expect(loadStoredAmllArtifactSummary(trackDir, null)).toBeNull();
    expect(deleteStoredAmllSource(trackDir, 'missing.lrc')).toBe(false);

    saveAmllRecord(trackDir, record());
    const artifactPath = path.join(
      trackDir,
      'lyrics',
      'providers',
      'amll-42.json',
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    artifact.record.id = 43;
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    expect(
      loadStoredAmllArtifactSummary(trackDir, {
        name: 'amll',
        recordId: 42,
        artifactFilename: 'amll-42.json',
      }),
    ).toBeNull();
  });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isTranslatedLyricsLanguage,
  isAutomaticLyricsLanguage,
  extractYtDlpSubtitleLanguage,
  resolveTrackLyricsPath,
  backfillLyricsSourceLabels,
  allocateLyricsFilename,
  importManualLyricsText,
  importManualLyricsFile,
  getTrackLyricsState,
  hasCurrentFullT2Lyrics,
  loadTrackLyricsManifest,
  setLyricsSourceLabel,
  setLyricsSourceOffset,
  setLyricsSourcePreference,
  deleteLyricsSource,
  readTrackLyrics,
  saveTrackLyricsText,
} from './lyrics.js';
import {
  computeLyricsSourceFingerprint,
  saveTrackLyricsTiming,
} from './lyricsTiming.js';
import { listTracks } from './tracks.js';

describe('isTranslatedLyricsLanguage', () => {
  it('rejects YouTube translated caption language tags', () => {
    expect(isTranslatedLyricsLanguage('ja-zh-TW')).toBe(true);
    expect(isTranslatedLyricsLanguage('en-ja')).toBe(true);
  });

  it('allows normal BCP-47 variants and original automatic tags', () => {
    expect(isTranslatedLyricsLanguage(null)).toBe(false);
    expect(isTranslatedLyricsLanguage('')).toBe(false);
    expect(isTranslatedLyricsLanguage('zh-Hant')).toBe(false);
    expect(isTranslatedLyricsLanguage('zh-TW')).toBe(false);
    expect(isTranslatedLyricsLanguage('en-US')).toBe(false);
    expect(isTranslatedLyricsLanguage('zh-Hant-orig')).toBe(false);
  });
});

describe('isAutomaticLyricsLanguage', () => {
  it('detects YouTube original automatic caption language tags', () => {
    expect(isAutomaticLyricsLanguage('en-orig')).toBe(true);
    expect(isAutomaticLyricsLanguage('zh_Hant_orig')).toBe(true);
    expect(isAutomaticLyricsLanguage('ja.orig')).toBe(true);
  });

  it('allows normal manual caption language tags', () => {
    expect(isAutomaticLyricsLanguage('zh-Hant')).toBe(false);
    expect(isAutomaticLyricsLanguage('zh-TW')).toBe(false);
    expect(isAutomaticLyricsLanguage('en-US')).toBe(false);
  });
});

describe('extractYtDlpSubtitleLanguage', () => {
  it('accepts only safe structured subtitle sidecar names', () => {
    expect(extractYtDlpSubtitleLanguage('audio.ja.vtt')).toBe('ja');
    expect(extractYtDlpSubtitleLanguage(undefined)).toBe(null);
    expect(extractYtDlpSubtitleLanguage('')).toBe(null);
    expect(extractYtDlpSubtitleLanguage('audio/ja.vtt')).toBe(null);
    expect(extractYtDlpSubtitleLanguage('audio\\ja.vtt')).toBe(null);
    expect(extractYtDlpSubtitleLanguage('audio.ja.txt')).toBe(null);
    expect(extractYtDlpSubtitleLanguage('captions.ja.vtt')).toBe(null);
    expect(extractYtDlpSubtitleLanguage('audio.ja-orig.vtt')).toBe(null);
    expect(extractYtDlpSubtitleLanguage('audio.ja-zh-TW.vtt')).toBe(null);
    expect(extractYtDlpSubtitleLanguage('audio...vtt')).toBe(null);
  });
});

describe('resolveTrackLyricsPath', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-lyrics-test-'));
    const lyricsDir = path.join(dir, 'tracks', 'abc', 'lyrics');
    fs.mkdirSync(lyricsDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(lyricsDir, 'ja.vtt'), 'WEBVTT');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves an existing lyrics file inside the track lyrics directory', () => {
    expect(resolveTrackLyricsPath(dir, 'abc', 'ja.vtt')).toBe(
      path.join(path.resolve(dir), 'tracks', 'abc', 'lyrics', 'ja.vtt'),
    );
    const result = readTrackLyrics(dir, 'abc', 'ja.vtt');
    expect(result).toMatchObject({
      source: { filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' },
      text: 'WEBVTT',
      timing: {
        status: 'missing',
        normalizerProfileId: 'lyrics-source-v2',
      },
    });
    expect(result.timing.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('saves and reads LRCLIB LRC lyrics as an optional source', () => {
    const trackDir = path.join(dir, 'tracks', 'abc');

    expect(
      saveTrackLyricsText(
        trackDir,
        { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
        '[00:01.00]Hello',
      ),
    ).toBe(true);

    expect(readTrackLyrics(dir, 'abc', 'lrclib-42.lrc')).toMatchObject({
      source: {
        filename: 'lrclib-42.lrc',
        language: 'und',
        kind: 'lrclib',
      },
      text: '[00:01.00]Hello',
      timing: {
        status: 'missing',
        normalizerProfileId: 'lyrics-source-v2',
      },
    });

    expect(listTracks(dir)[0].lyrics.sources).toEqual([
      { filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' },
      { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
    ]);
  });

  it('rejects traversal and non-existent lyrics filenames', () => {
    expect(resolveTrackLyricsPath(dir, 'abc', '../ja.vtt')).toBe(null);
    expect(resolveTrackLyricsPath(dir, '../abc', 'ja.vtt')).toBe(null);
    expect(resolveTrackLyricsPath(dir, 'abc', 'missing.vtt')).toBe(null);
    expect(readTrackLyrics(dir, 'abc', 'missing.vtt')).toBe(null);
  });

  it('persists an optional label so identically-tagged sources stay distinguishable', () => {
    const trackDir = path.join(dir, 'tracks', 'abc');

    saveTrackLyricsText(
      trackDir,
      {
        filename: 'lrclib-42.lrc',
        language: 'und',
        kind: 'lrclib',
        label: 'Short n Sweet',
      },
      '[00:01.00]Hello',
    );
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-99.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.00]World',
    );

    const sources = listTracks(dir)[0].lyrics.sources;
    expect(sources).toContainEqual({
      filename: 'lrclib-42.lrc',
      language: 'und',
      kind: 'lrclib',
      label: 'Short n Sweet',
    });
    // No label was ever set for this one — omitted entirely, not null/''.
    expect(sources).toContainEqual({
      filename: 'lrclib-99.lrc',
      language: 'und',
      kind: 'lrclib',
    });
  });

  it('re-saving a second source does not drop an existing source label', () => {
    const trackDir = path.join(dir, 'tracks', 'abc');

    saveTrackLyricsText(
      trackDir,
      {
        filename: 'lrclib-42.lrc',
        language: 'und',
        kind: 'lrclib',
        label: 'Short n Sweet',
      },
      '[00:01.00]Hello',
    );
    // saveTrackLyricsText rewrites the WHOLE manifest each call, sourced
    // from listTrackLyricsSources() — this is the regression this guards:
    // a label only round-trips if that read path also carries it forward.
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-99.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.00]World',
    );

    expect(
      listTracks(dir)[0].lyrics.sources.find(
        (source) => source.filename === 'lrclib-42.lrc',
      ),
    ).toEqual({
      filename: 'lrclib-42.lrc',
      language: 'und',
      kind: 'lrclib',
      label: 'Short n Sweet',
    });
  });
});

describe('setLyricsSourceOffset', () => {
  let dir;
  let trackDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-lyrics-offset-'));
    trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveTrackLyricsText(
      trackDir,
      {
        filename: 'main.lrc',
        language: 'ja',
        kind: 'manual',
        label: 'Main',
      },
      '[00:01.00]Hello',
    );
    saveTrackLyricsText(
      trackDir,
      { filename: 'alternate.vtt', language: 'ja', kind: 'manual' },
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello',
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists independent millisecond offsets without rewriting source bytes', () => {
    const originalLyrics = fs.readFileSync(
      path.join(trackDir, 'lyrics', 'main.lrc'),
      'utf8',
    );

    expect(setLyricsSourceOffset(trackDir, 'main.lrc', 1300)).toContainEqual({
      filename: 'main.lrc',
      language: 'ja',
      kind: 'manual',
      label: 'Main',
      offsetMs: 1300,
    });
    setLyricsSourceOffset(trackDir, 'alternate.vtt', -400);

    expect(readTrackLyrics(dir, 'abc', 'main.lrc').source).toMatchObject({
      filename: 'main.lrc',
      label: 'Main',
      offsetMs: 1300,
    });
    expect(readTrackLyrics(dir, 'abc', 'alternate.vtt').source).toMatchObject({
      filename: 'alternate.vtt',
      offsetMs: -400,
    });
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'main.lrc'), 'utf8'),
    ).toBe(originalLyrics);
  });

  it('treats zero as the default while preserving sibling offsets and labels', () => {
    setLyricsSourceOffset(trackDir, 'main.lrc', 1300);
    setLyricsSourceOffset(trackDir, 'alternate.vtt', -400);
    const sources = setLyricsSourceOffset(trackDir, 'main.lrc', 0);

    expect(sources).toContainEqual({
      filename: 'main.lrc',
      language: 'ja',
      kind: 'manual',
      label: 'Main',
    });
    expect(sources).toContainEqual({
      filename: 'alternate.vtt',
      language: 'ja',
      kind: 'manual',
      offsetMs: -400,
    });
  });

  it('rejects unknown sources, fractions, and unbounded values', () => {
    expect(setLyricsSourceOffset(trackDir, 'missing.lrc', 100)).toBe(null);
    expect(setLyricsSourceOffset(trackDir, 'main.lrc', 100.5)).toBe(null);
    expect(
      setLyricsSourceOffset(trackDir, 'main.lrc', Number.MAX_SAFE_INTEGER),
    ).toBe(null);
    expect(
      readTrackLyrics(dir, 'abc', 'main.lrc').source.offsetMs,
    ).toBeUndefined();
  });
});

describe('lyrics source preference', () => {
  let dir;
  let trackDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-lyrics-preference-'));
    trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveTrackLyricsText(
      trackDir,
      { filename: 'manual.lrc', language: 'ja', kind: 'manual' },
      '[00:01.00]Manual',
    );
    saveTrackLyricsText(
      trackDir,
      { filename: 'netease-42.lrc', language: 'und', kind: 'netease' },
      '[00:01.00]Provider',
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('projects a persisted user-owned preference through the library state', () => {
    expect(
      setLyricsSourcePreference(trackDir, 'manual.lrc', 'user'),
    ).toMatchObject({
      preferredSourceFilename: 'manual.lrc',
      preferenceOrigin: 'user',
    });

    expect(loadTrackLyricsManifest(trackDir).preference).toEqual({
      filename: 'manual.lrc',
      origin: 'user',
    });
    expect(getTrackLyricsState(trackDir)).toMatchObject({
      preferredSourceFilename: 'manual.lrc',
      preferenceOrigin: 'user',
    });
    expect(listTracks(dir)[0].lyrics).toMatchObject({
      preferredSourceFilename: 'manual.lrc',
      preferenceOrigin: 'user',
    });
  });

  it('does not let an automatic preference replace a user choice', () => {
    setLyricsSourcePreference(trackDir, 'manual.lrc', 'user');

    expect(
      setLyricsSourcePreference(trackDir, 'netease-42.lrc', 'automatic', {
        preserveUser: true,
      }),
    ).toMatchObject({
      preferredSourceFilename: 'manual.lrc',
      preferenceOrigin: 'user',
    });
  });

  it('clears a preference when its source is deleted', () => {
    setLyricsSourcePreference(trackDir, 'netease-42.lrc', 'automatic');

    expect(deleteLyricsSource(trackDir, 'netease-42.lrc')).toBe(true);
    expect(getTrackLyricsState(trackDir)).not.toHaveProperty(
      'preferredSourceFilename',
    );
  });

  it('detects a current full T2 sidecar for automatic acquisition rechecks', () => {
    const sourceFilename = 'netease-42.lrc';
    const sourceSha256 = computeLyricsSourceFingerprint(
      trackDir,
      sourceFilename,
    );
    saveTrackLyricsTiming(trackDir, sourceFilename, sourceSha256, {
      schemaVersion: 1,
      documentId: 'netease:42',
      normalizerProfileId: 'lyrics-source-v2',
      source: { filename: sourceFilename, sha256: sourceSha256 },
      granularity: 'T2',
      lines: [
        {
          lineId: 'l1',
          text: 'Provider',
          startMs: 1000,
          endMs: 2000,
          segments: [
            {
              segmentId: 's1',
              text: 'Provider',
              startMs: 1000,
              endMs: 2000,
            },
          ],
        },
      ],
    });

    expect(hasCurrentFullT2Lyrics(trackDir)).toBe(true);
  });

  it('does not treat a mixed T2 and line-timed sidecar as complete T2', () => {
    const sourceFilename = 'netease-42.lrc';
    const sourceSha256 = computeLyricsSourceFingerprint(
      trackDir,
      sourceFilename,
    );
    saveTrackLyricsTiming(trackDir, sourceFilename, sourceSha256, {
      schemaVersion: 1,
      documentId: 'netease:42',
      normalizerProfileId: 'lyrics-source-v2',
      source: { filename: sourceFilename, sha256: sourceSha256 },
      granularity: 'T2',
      lines: [
        {
          lineId: 'l1',
          text: 'Provider',
          startMs: 1000,
          endMs: 2000,
          segments: [
            {
              segmentId: 's1',
              text: 'Provider',
              startMs: 1000,
              endMs: 2000,
            },
          ],
        },
        {
          lineId: 'l2',
          text: 'Fallback',
          startMs: 2000,
          endMs: 3000,
        },
      ],
    });

    expect(hasCurrentFullT2Lyrics(trackDir)).toBe(false);
  });
});

describe('backfillLyricsSourceLabels', () => {
  let dir;
  let trackDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-backfill-labels-'));
    trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    // listTracks() enumerates real audio files — needed for the
    // listTracks(dir)[0].lyrics.sources assertions below.
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a label for each unlabeled lrclib source by its candidate id', async () => {
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.00]Hello',
    );
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-99.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.00]World',
    );

    const resolveLabel = vi.fn(async (candidateId) =>
      candidateId === 42 ? 'Short n Sweet' : 'emails i cant send',
    );
    const sources = await backfillLyricsSourceLabels(trackDir, resolveLabel);

    expect(resolveLabel).toHaveBeenCalledWith(42);
    expect(resolveLabel).toHaveBeenCalledWith(99);
    expect(sources).toContainEqual(
      expect.objectContaining({
        filename: 'lrclib-42.lrc',
        label: 'Short n Sweet',
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        filename: 'lrclib-99.lrc',
        label: 'emails i cant send',
      }),
    );

    // Persisted, not just returned.
    expect(
      listTracks(dir)[0].lyrics.sources.find(
        (source) => source.filename === 'lrclib-42.lrc',
      ).label,
    ).toBe('Short n Sweet');
  });

  it('leaves an already-labeled source untouched and never calls the resolver for it', async () => {
    saveTrackLyricsText(
      trackDir,
      {
        filename: 'lrclib-42.lrc',
        language: 'und',
        kind: 'lrclib',
        label: 'Already Labeled',
      },
      '[00:01.00]Hello',
    );

    const resolveLabel = vi.fn(async () => 'Should Not Be Used');
    const sources = await backfillLyricsSourceLabels(trackDir, resolveLabel);

    expect(resolveLabel).not.toHaveBeenCalled();
    expect(sources).toContainEqual(
      expect.objectContaining({ label: 'Already Labeled' }),
    );
  });

  it('leaves the source unlabeled when the resolver fails or returns nothing', async () => {
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.00]Hello',
    );

    const sources = await backfillLyricsSourceLabels(trackDir, async () => {
      throw new Error('network error');
    });

    expect(sources).toContainEqual(
      expect.not.objectContaining({ label: expect.anything() }),
    );
    expect(sources.find((s) => s.filename === 'lrclib-42.lrc')).toEqual({
      filename: 'lrclib-42.lrc',
      language: 'und',
      kind: 'lrclib',
    });
  });

  it('ignores non-lrclib sources and filenames that do not parse as a candidate id', async () => {
    const lyricsDir = path.join(trackDir, 'lyrics');
    fs.mkdirSync(lyricsDir, { recursive: true });
    fs.writeFileSync(path.join(lyricsDir, 'ja.vtt'), 'WEBVTT');

    const resolveLabel = vi.fn(async () => 'should not be called');
    const sources = await backfillLyricsSourceLabels(trackDir, resolveLabel);

    expect(resolveLabel).not.toHaveBeenCalled();
    expect(sources).toEqual([
      { filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' },
    ]);
  });

  it('does not clobber a manual label set while a lookup is in flight', async () => {
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.00]Hello',
    );

    const sources = await backfillLyricsSourceLabels(trackDir, async () => {
      // Simulate a concurrent manual edit landing while this lookup is
      // still in flight, before the backfill writes its own result back.
      setLyricsSourceLabel(trackDir, 'lrclib-42.lrc', 'Manually Renamed');
      return 'Resolved From Network';
    });

    expect(sources).toContainEqual(
      expect.objectContaining({
        filename: 'lrclib-42.lrc',
        label: 'Manually Renamed',
      }),
    );
    expect(
      listTracks(dir)[0].lyrics.sources.find(
        (source) => source.filename === 'lrclib-42.lrc',
      ).label,
    ).toBe('Manually Renamed');
  });
});

describe('allocateLyricsFilename', () => {
  let dir;
  let trackDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-allocate-test-'));
    trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the bare stem when nothing exists yet', () => {
    expect(allocateLyricsFilename(trackDir, 'manual', '.lrc')).toBe(
      'manual.lrc',
    );
  });

  it('never returns a filename that already exists, so a caller can never clobber an existing source', () => {
    saveTrackLyricsText(
      trackDir,
      { filename: 'manual.lrc', language: 'und', kind: 'manual' },
      '[00:01.00]Hello',
    );

    expect(allocateLyricsFilename(trackDir, 'manual', '.lrc')).toBe(
      'manual-2.lrc',
    );

    saveTrackLyricsText(
      trackDir,
      { filename: 'manual-2.lrc', language: 'und', kind: 'manual' },
      '[00:01.00]Hello',
    );

    expect(allocateLyricsFilename(trackDir, 'manual', '.lrc')).toBe(
      'manual-3.lrc',
    );
  });

  it('returns null for a baseStem that would produce an unsafe filename', () => {
    expect(allocateLyricsFilename(trackDir, 'has space', '.lrc')).toBe(null);
  });
});

describe('importManualLyricsText', () => {
  let dir;
  let trackDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-manual-lyrics-'));
    trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saves pasted plain text as an ungated manual LRC source', () => {
    const result = importManualLyricsText(trackDir, {
      text: 'First line\nSecond line',
      label: 'Pasted draft',
    });

    expect(result.source).toEqual({
      filename: 'manual.lrc',
      language: 'und',
      kind: 'manual',
      label: 'Pasted draft',
    });
    expect(readTrackLyrics(dir, 'abc', 'manual.lrc')).toMatchObject({
      source: result.source,
      text: 'First line\nSecond line',
      timing: { status: 'missing' },
    });
    expect(listTracks(dir)[0].lyrics.sources).toContainEqual(result.source);
  });

  it('allocates a new filename instead of overwriting an existing manual source', () => {
    importManualLyricsText(trackDir, { text: 'First', label: 'First' });
    const second = importManualLyricsText(trackDir, {
      text: 'Second',
      label: 'Second',
    });

    expect(second.source.filename).toBe('manual-2.lrc');
    expect(readTrackLyrics(dir, 'abc', 'manual.lrc').text).toBe('First');
    expect(readTrackLyrics(dir, 'abc', 'manual-2.lrc').text).toBe('Second');
  });

  it('preserves VTT text as a manual VTT source when requested', () => {
    const result = importManualLyricsText(trackDir, {
      text: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello',
      filenameHint: 'captions.vtt',
    });

    expect(result.source).toMatchObject({
      filename: 'manual.vtt',
      language: 'und',
      kind: 'manual',
    });
    expect(readTrackLyrics(dir, 'abc', 'manual.vtt').text).toContain('WEBVTT');
  });

  it('rejects blank manual lyrics text', () => {
    expect(importManualLyricsText(trackDir, { text: '   ' })).toBe(null);
  });
});

describe('importManualLyricsFile', () => {
  let dir;
  let trackDir;
  let sourceDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-manual-file-'));
    sourceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-manual-file-src-'),
    );
    trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('imports a text file as a manual LRC source without storing its path', () => {
    const sourcePath = path.join(sourceDir, 'my lyrics.txt');
    fs.writeFileSync(sourcePath, 'Plain line');

    const result = importManualLyricsFile(trackDir, sourcePath);

    expect(result.source).toEqual({
      filename: 'manual.lrc',
      language: 'und',
      kind: 'manual',
      label: 'my lyrics',
    });
    expect(readTrackLyrics(dir, 'abc', 'manual.lrc').text).toBe('Plain line');
    expect(JSON.stringify(listTracks(dir)[0].lyrics.sources)).not.toContain(
      sourcePath,
    );
  });

  it('rejects unsupported manual lyrics file extensions', () => {
    const sourcePath = path.join(sourceDir, 'notes.docx');
    fs.writeFileSync(sourcePath, 'nope');

    expect(importManualLyricsFile(trackDir, sourcePath)).toBe(null);
  });
});

describe('setLyricsSourceLabel', () => {
  let dir;
  let trackDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-set-label-'));
    trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.00]Hello',
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sets a label on an existing source', () => {
    setLyricsSourceLabel(trackDir, 'lrclib-42.lrc', 'My Label');
    expect(
      listTracks(dir)[0].lyrics.sources.find(
        (s) => s.filename === 'lrclib-42.lrc',
      ).label,
    ).toBe('My Label');
  });

  it('truncates an overlong label the same way the auto-derived one does', () => {
    setLyricsSourceLabel(trackDir, 'lrclib-42.lrc', 'x'.repeat(60));
    const label = listTracks(dir)[0].lyrics.sources.find(
      (s) => s.filename === 'lrclib-42.lrc',
    ).label;
    expect(label.length).toBe(32);
    expect(label.endsWith('…')).toBe(true);
  });

  it('clears an existing label when given a blank string', () => {
    setLyricsSourceLabel(trackDir, 'lrclib-42.lrc', 'My Label');
    setLyricsSourceLabel(trackDir, 'lrclib-42.lrc', '   ');
    expect(
      listTracks(dir)[0].lyrics.sources.find(
        (s) => s.filename === 'lrclib-42.lrc',
      ),
    ).toEqual({ filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' });
  });

  it('returns null for a filename that is not an existing source', () => {
    expect(setLyricsSourceLabel(trackDir, 'missing.lrc', 'x')).toBe(null);
  });
});

describe('deleteLyricsSource', () => {
  let dir;
  let trackDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-delete-source-'));
    trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.00]Hello',
    );
    saveTrackLyricsText(
      trackDir,
      { filename: 'manual.lrc', language: 'und', kind: 'manual' },
      '[00:01.00]World',
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('removes the file and its manifest entry, leaving other sources intact', () => {
    const timingPath = path.join(
      trackDir,
      'lyrics',
      'timing',
      'lrclib-42.lrc.json',
    );
    const readingPath = path.join(
      trackDir,
      'lyrics',
      'readings',
      'lrclib-42.lrc.json',
    );
    fs.mkdirSync(path.dirname(timingPath), { recursive: true });
    fs.mkdirSync(path.dirname(readingPath), { recursive: true });
    fs.writeFileSync(timingPath, '{}');
    fs.writeFileSync(readingPath, '{}');

    expect(deleteLyricsSource(trackDir, 'lrclib-42.lrc')).toBe(true);

    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'lrclib-42.lrc'))).toBe(
      false,
    );
    const sources = listTracks(dir)[0].lyrics.sources;
    expect(sources.map((s) => s.filename)).toEqual(['manual.lrc']);
    expect(fs.existsSync(timingPath)).toBe(false);
    expect(fs.existsSync(readingPath)).toBe(false);
  });

  it('returns false for a filename that does not exist', () => {
    expect(deleteLyricsSource(trackDir, 'missing.lrc')).toBe(false);
  });

  it('rejects an unsafe filename without touching the filesystem', () => {
    expect(deleteLyricsSource(trackDir, '../audio.mp3')).toBe(false);
    expect(fs.existsSync(path.join(trackDir, 'audio.mp3'))).toBe(true);
  });
});

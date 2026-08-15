import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isServableFilename,
  isArtworkFilename,
  isAutomaticLyricsLanguage,
  isLyricsSubtitleFilename,
  isTranslatedLyricsLanguage,
  resolveTrackPath,
  resolveTrackDir,
  resolveTrackAudioPath,
  resolveTrackAssetPath,
  resolveTrackLyricsPath,
  resolveSeparationsDir,
  resolveSeparationResultPath,
  hasSeparation,
  hasSeparationResultFile,
  loadSeparationManifest,
  recordSeparationResult,
  selectSeparationResult,
  listTracks,
  loadIndex,
  importLocalAudioFiles,
  migrateTrackAlbumMetadata,
  refreshTrackMetadataFromSidecars,
  readTrackLyrics,
  saveIndexEntry,
  saveTrackLyricsText,
  updateTrackMetadata,
  buildRangeResponse,
  runBackfillPass,
  deleteTrack,
  resolvePlaylistCoverPath,
  writePlaylistCoverFile,
  writePlaylistCoverFromUrl,
  deletePlaylistCoverDir,
  INDEX_FILENAME,
} from './library.js';

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('isServableFilename', () => {
  it('accepts known audio extensions', () => {
    expect(isServableFilename('dQw4w9WgXcQ.webm')).toBe(true);
    expect(isServableFilename('abc.mp3')).toBe(true);
  });

  it('rejects filenames with a path separator', () => {
    expect(isServableFilename('sub/abc.mp3')).toBe(false);
    expect(isServableFilename('sub\\abc.mp3')).toBe(false);
  });

  it('rejects non-audio extensions', () => {
    expect(isServableFilename('notes.txt')).toBe(false);
  });

  it('rejects a filename with no extension', () => {
    expect(isServableFilename('noext')).toBe(false);
  });

  it('rejects empty or non-string input', () => {
    expect(isServableFilename('')).toBe(false);
    expect(isServableFilename(null)).toBe(false);
  });
});

describe('isArtworkFilename', () => {
  it('accepts thumbnail image variants', () => {
    expect(isArtworkFilename('thumbnail.jpg')).toBe(true);
    expect(isArtworkFilename('thumbnail.jpeg')).toBe(true);
    expect(isArtworkFilename('thumbnail.png')).toBe(true);
    expect(isArtworkFilename('thumbnail.webp')).toBe(true);
  });

  it('rejects non-thumbnail or unsafe image filenames', () => {
    expect(isArtworkFilename('cover.jpg')).toBe(false);
    expect(isArtworkFilename('thumbnail.gif')).toBe(false);
    expect(isArtworkFilename('sub/thumbnail.jpg')).toBe(false);
  });
});

describe('isLyricsSubtitleFilename', () => {
  it('accepts VTT language filenames', () => {
    expect(isLyricsSubtitleFilename('ja.vtt')).toBe(true);
    expect(isLyricsSubtitleFilename('zh-Hant.vtt')).toBe(true);
    expect(isLyricsSubtitleFilename('en.orig.vtt')).toBe(true);
    expect(isLyricsSubtitleFilename('lrclib-42.lrc')).toBe(true);
  });

  it('rejects unsafe or unsupported lyrics filenames', () => {
    expect(isLyricsSubtitleFilename('lyrics.srt')).toBe(false);
    expect(isLyricsSubtitleFilename('lyrics/ja.vtt')).toBe(false);
    expect(isLyricsSubtitleFilename('../ja.vtt')).toBe(false);
    expect(isLyricsSubtitleFilename('ja')).toBe(false);
  });
});

describe('isTranslatedLyricsLanguage', () => {
  it('rejects YouTube translated caption language tags', () => {
    expect(isTranslatedLyricsLanguage('ja-zh-TW')).toBe(true);
    expect(isTranslatedLyricsLanguage('en-ja')).toBe(true);
  });

  it('allows normal BCP-47 variants and original automatic tags', () => {
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

describe('resolveTrackPath', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-resolve-test-'));
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a normal file inside dir', () => {
    expect(resolveTrackPath(dir, 'abc.mp3')).toBe(
      path.join(path.resolve(dir), 'abc.mp3'),
    );
  });

  it('rejects ../ traversal', () => {
    expect(resolveTrackPath(dir, '../abc.mp3')).toBe(null);
  });

  it('rejects a decoded %2F traversal attempt', () => {
    expect(resolveTrackPath(dir, decodeURIComponent('..%2Fabc.mp3'))).toBe(
      null,
    );
  });

  it('rejects an absolute path', () => {
    expect(resolveTrackPath(dir, 'C:\\Windows\\x.mp3')).toBe(null);
  });

  it('rejects a filename containing a subdirectory', () => {
    expect(resolveTrackPath(dir, 'sub/abc.mp3')).toBe(null);
  });

  it('rejects a non-audio extension', () => {
    expect(resolveTrackPath(dir, 'abc.txt')).toBe(null);
  });
});

describe('resolveSeparationsDir', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepdir-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves to <dir>/tracks/<trackId>/separations', () => {
    expect(resolveSeparationsDir(dir, 'dQw4w9WgXcQ')).toBe(
      path.join(path.resolve(dir), 'tracks', 'dQw4w9WgXcQ', 'separations'),
    );
  });

  it('rejects ../ traversal via trackId', () => {
    expect(resolveSeparationsDir(dir, '../evil')).toBe(null);
  });

  it('rejects an absolute trackId', () => {
    expect(resolveSeparationsDir(dir, 'C:\\Windows')).toBe(null);
  });

  it('rejects a Windows drive-relative trackId', () => {
    expect(resolveSeparationsDir(dir, 'C:Windows')).toBe(null);
  });

  it('rejects empty or non-string trackId', () => {
    expect(resolveSeparationsDir(dir, '')).toBe(null);
    expect(resolveSeparationsDir(dir, null)).toBe(null);
  });
});

describe('resolveTrackDir', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-trackdir-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a safe structured track directory', () => {
    expect(resolveTrackDir(dir, 'abc')).toBe(
      path.join(path.resolve(dir), 'tracks', 'abc'),
    );
  });

  it('rejects traversal and Windows path forms', () => {
    expect(resolveTrackDir(dir, '../abc')).toBe(null);
    expect(resolveTrackDir(dir, 'C:\\Windows')).toBe(null);
    expect(resolveTrackDir(dir, 'C:Windows')).toBe(null);
  });
});

describe('resolveSeparationResultPath', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a preset file that exists on disk', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');

    expect(resolveSeparationResultPath(dir, 'abc', 'standard.wav')).toBe(
      path.join(
        path.resolve(dir),
        'tracks',
        'abc',
        'separations',
        'standard.wav',
      ),
    );
  });

  it('returns null when the file has not been produced yet', () => {
    expect(resolveSeparationResultPath(dir, 'abc', 'standard.wav')).toBe(null);
  });

  it('rejects a filename outside the safe charset (path traversal, wrong extension)', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');

    expect(resolveSeparationResultPath(dir, 'abc', '../../secret')).toBe(null);
    expect(resolveSeparationResultPath(dir, 'abc', 'standard.mp3')).toBe(null);
    expect(resolveSeparationResultPath(dir, 'abc', 'standard.wav/../x')).toBe(
      null,
    );
  });

  it('rejects a traversal attempt via trackId even with a valid preset filename', () => {
    expect(resolveSeparationResultPath(dir, '../evil', 'standard.wav')).toBe(
      null,
    );
  });
});

describe('resolveTrackAssetPath', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-asset-test-'));
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'y');
    fs.writeFileSync(path.join(trackDir, 'info.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves structured audio and artwork assets', () => {
    expect(resolveTrackAudioPath(dir, 'abc')).toBe(
      path.join(path.resolve(dir), 'tracks', 'abc', 'audio.mp3'),
    );
    expect(resolveTrackAssetPath(dir, 'abc', 'audio.mp3')).toBe(
      path.join(path.resolve(dir), 'tracks', 'abc', 'audio.mp3'),
    );
    expect(resolveTrackAssetPath(dir, 'abc', 'thumbnail.jpg')).toBe(
      path.join(path.resolve(dir), 'tracks', 'abc', 'thumbnail.jpg'),
    );
  });

  it('does not serve source metadata, separation results, or traversal attempts', () => {
    expect(resolveTrackAssetPath(dir, 'abc', 'info.json')).toBe(null);
    // Separation results live under separations/<presetId>.wav and are
    // served via resolveSeparationResultPath, not this resolver — a flat
    // stems.wav is no longer a recognized asset filename here.
    expect(resolveTrackAssetPath(dir, 'abc', 'stems.wav')).toBe(null);
    expect(resolveTrackAssetPath(dir, 'abc', '../audio.mp3')).toBe(null);
    expect(resolveTrackAssetPath(dir, '../abc', 'audio.mp3')).toBe(null);
  });
});

describe('importLocalAudioFiles', () => {
  let dir;
  let sourceDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-local-import-test-'));
    sourceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-local-import-src-'),
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('copies local audio into a structured track folder and records managed import metadata', () => {
    const sourcePath = path.join(sourceDir, '夜に駆ける.mp3');
    fs.writeFileSync(sourcePath, 'audio-bytes');

    const result = importLocalAudioFiles(dir, [sourcePath]);

    expect(result).toEqual({
      imported: [{ id: '夜に駆ける', title: '夜に駆ける' }],
      skipped: [],
    });
    expect(
      fs.readFileSync(
        path.join(dir, 'tracks', '夜に駆ける', 'audio.mp3'),
        'utf8',
      ),
    ).toBe('audio-bytes');
    const indexed = loadIndex(dir).tracks['夜に駆ける'];
    expect(indexed).toEqual({
      title: '夜に駆ける',
      sourceType: 'local-file',
      storageType: 'managed',
      audioFilename: 'audio.mp3',
      originalFilename: '夜に駆ける.mp3',
      importedAt: expect.any(String),
      fileSize: Buffer.byteLength('audio-bytes'),
      contentHash: sha256Text('audio-bytes'),
    });
    expect(Date.parse(indexed.importedAt)).not.toBeNaN();
    expect(indexed).not.toHaveProperty('originalPath');
    expect(listTracks(dir)[0]).toMatchObject({
      id: '夜に駆ける',
      title: '夜に駆ける',
      sourceType: 'local-file',
      storageType: 'managed',
      originalFilename: '夜に駆ける.mp3',
      importedAt: indexed.importedAt,
      fileSize: Buffer.byteLength('audio-bytes'),
      contentHash: sha256Text('audio-bytes'),
      url: 'utawakui-media://track/%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B/audio.mp3',
    });
  });

  it('imports duplicate filename stems under unique track ids without overwriting', () => {
    const first = path.join(sourceDir, 'Song.mp3');
    const second = path.join(sourceDir, 'Song.webm');
    fs.writeFileSync(first, 'first');
    fs.writeFileSync(second, 'second');

    const result = importLocalAudioFiles(dir, [first, second]);

    expect(result.imported).toEqual([
      { id: 'Song', title: 'Song' },
      { id: 'Song-2', title: 'Song' },
    ]);
    expect(
      fs.readFileSync(path.join(dir, 'tracks', 'Song', 'audio.mp3'), 'utf8'),
    ).toBe('first');
    expect(
      fs.readFileSync(path.join(dir, 'tracks', 'Song-2', 'audio.webm'), 'utf8'),
    ).toBe('second');
    expect(loadIndex(dir).tracks['Song-2']).toMatchObject({
      title: 'Song',
      sourceType: 'local-file',
      storageType: 'managed',
      audioFilename: 'audio.webm',
      originalFilename: 'Song.webm',
      fileSize: Buffer.byteLength('second'),
      contentHash: sha256Text('second'),
    });
  });

  it('skips duplicate local audio by content hash across filenames', () => {
    const first = path.join(sourceDir, 'Alpha.mp3');
    const second = path.join(sourceDir, 'Renamed Copy.flac');
    fs.writeFileSync(first, 'same-audio-bytes');
    fs.writeFileSync(second, 'same-audio-bytes');

    const result = importLocalAudioFiles(dir, [first, second]);

    expect(result.imported).toEqual([{ id: 'Alpha', title: 'Alpha' }]);
    expect(result.skipped).toEqual([
      {
        path: second,
        reason: 'duplicate-content',
        existingTrackId: 'Alpha',
      },
    ]);
    expect(fs.existsSync(path.join(dir, 'tracks', 'Renamed Copy'))).toBe(false);
    expect(Object.keys(loadIndex(dir).tracks)).toEqual(['Alpha']);
  });

  it('backfills missing local content hashes before checking new imports', () => {
    const trackDir = path.join(dir, 'tracks', 'Existing');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'existing-audio');
    saveIndexEntry(dir, 'Existing', {
      title: 'Existing',
      sourceType: 'local-file',
      storageType: 'managed',
      audioFilename: 'audio.mp3',
      originalFilename: 'Existing.mp3',
      importedAt: '2026-08-14T00:00:00.000Z',
      fileSize: Buffer.byteLength('existing-audio'),
    });
    const sourcePath = path.join(sourceDir, 'Existing Copy.wav');
    fs.writeFileSync(sourcePath, 'existing-audio');

    const result = importLocalAudioFiles(dir, [sourcePath]);

    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([
      {
        path: sourcePath,
        reason: 'duplicate-content',
        existingTrackId: 'Existing',
      },
    ]);
    expect(loadIndex(dir).tracks.Existing.contentHash).toBe(
      sha256Text('existing-audio'),
    );
  });

  it('skips non-audio sources and missing files without throwing', () => {
    const textPath = path.join(sourceDir, 'notes.txt');
    const missingPath = path.join(sourceDir, 'missing.mp3');
    fs.writeFileSync(textPath, 'not audio');

    const result = importLocalAudioFiles(dir, [textPath, missingPath]);

    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([
      { path: textPath, reason: 'unsupported-extension' },
      { path: missingPath, reason: 'missing-file' },
    ]);
    expect(fs.existsSync(path.join(dir, 'tracks'))).toBe(false);
  });
});

describe('writePlaylistCoverFile / resolvePlaylistCoverPath / deletePlaylistCoverDir', () => {
  let dir;
  let sourceDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-cover-test-'));
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-cover-src-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('copies a chosen image into playlist-covers/<id>/cover.<ext> and resolves it back', () => {
    const sourcePath = path.join(sourceDir, 'picked.png');
    fs.writeFileSync(sourcePath, 'image-bytes');

    const filename = writePlaylistCoverFile(dir, 'playlist-1', sourcePath);
    expect(filename).toBe('cover.png');
    expect(
      fs.readFileSync(
        path.join(dir, 'playlist-covers', 'playlist-1', 'cover.png'),
        'utf8',
      ),
    ).toBe('image-bytes');

    expect(resolvePlaylistCoverPath(dir, 'playlist-1', 'cover.png')).toBe(
      path.join(
        path.resolve(dir),
        'playlist-covers',
        'playlist-1',
        'cover.png',
      ),
    );
  });

  it('rejects a non-image source extension', () => {
    const sourcePath = path.join(sourceDir, 'not-an-image.txt');
    fs.writeFileSync(sourcePath, 'nope');

    expect(writePlaylistCoverFile(dir, 'playlist-1', sourcePath)).toBe(null);
  });

  it('replaces a previous cover of a different extension instead of leaving both', () => {
    fs.writeFileSync(path.join(sourceDir, 'first.png'), 'a');
    fs.writeFileSync(path.join(sourceDir, 'second.jpg'), 'b');

    writePlaylistCoverFile(
      dir,
      'playlist-1',
      path.join(sourceDir, 'first.png'),
    );
    const filename = writePlaylistCoverFile(
      dir,
      'playlist-1',
      path.join(sourceDir, 'second.jpg'),
    );

    expect(filename).toBe('cover.jpg');
    const coverDir = path.join(dir, 'playlist-covers', 'playlist-1');
    expect(fs.readdirSync(coverDir)).toEqual(['cover.jpg']);
  });

  it('rejects traversal attempts via playlistId or coverFilename', () => {
    fs.writeFileSync(path.join(sourceDir, 'ok.png'), 'x');
    writePlaylistCoverFile(dir, 'playlist-1', path.join(sourceDir, 'ok.png'));

    expect(resolvePlaylistCoverPath(dir, '../evil', 'cover.png')).toBe(null);
    expect(resolvePlaylistCoverPath(dir, 'playlist-1', '../cover.png')).toBe(
      null,
    );
    expect(
      writePlaylistCoverFile(dir, '../evil', path.join(sourceDir, 'ok.png')),
    ).toBe(null);
  });

  it('returns null for a filename that does not match what is actually on disk', () => {
    fs.writeFileSync(path.join(sourceDir, 'ok.png'), 'x');
    writePlaylistCoverFile(dir, 'playlist-1', path.join(sourceDir, 'ok.png'));

    expect(resolvePlaylistCoverPath(dir, 'playlist-1', 'cover.jpg')).toBe(null);
  });

  it('deletePlaylistCoverDir removes the whole cover directory', () => {
    fs.writeFileSync(path.join(sourceDir, 'ok.png'), 'x');
    writePlaylistCoverFile(dir, 'playlist-1', path.join(sourceDir, 'ok.png'));

    deletePlaylistCoverDir(dir, 'playlist-1');

    expect(fs.existsSync(path.join(dir, 'playlist-covers', 'playlist-1'))).toBe(
      false,
    );
    expect(resolvePlaylistCoverPath(dir, 'playlist-1', 'cover.png')).toBe(null);
  });
});

describe('writePlaylistCoverFromUrl', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-cover-url-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  function stubFetch(response) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  }

  function fakeResponse({
    ok = true,
    status = 200,
    contentType = 'image/jpeg',
    body = 'image-bytes',
  } = {}) {
    return {
      ok,
      status,
      headers: {
        get: (name) => (name === 'content-type' ? contentType : null),
      },
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    };
  }

  it('downloads and writes the cover using the content-type extension', async () => {
    stubFetch(fakeResponse({ contentType: 'image/png' }));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe('cover.png');
    expect(
      fs.readFileSync(
        path.join(dir, 'playlist-covers', 'album-1', 'cover.png'),
        'utf8',
      ),
    ).toBe('image-bytes');
  });

  it('falls back to the URL extension when content-type is unrecognized', async () => {
    stubFetch(fakeResponse({ contentType: 'application/octet-stream' }));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe('cover.jpg');
  });

  it('returns null when neither content-type nor URL extension is a recognized image type', async () => {
    stubFetch(fakeResponse({ contentType: 'application/octet-stream' }));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault',
    );

    expect(filename).toBe(null);
  });

  it('returns null on a non-ok response instead of throwing', async () => {
    stubFetch(fakeResponse({ ok: false, status: 404 }));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe(null);
  });

  it('returns null when fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe(null);
  });

  it('rejects a traversal playlistId without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const filename = await writePlaylistCoverFromUrl(
      dir,
      '../evil',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces a previous cover of a different extension', async () => {
    stubFetch(fakeResponse({ contentType: 'image/png' }));
    await writePlaylistCoverFromUrl(dir, 'album-1', 'https://x/a.png');

    stubFetch(fakeResponse({ contentType: 'image/jpeg' }));
    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://x/a.jpg',
    );

    // image/jpeg maps to .jpeg here, not .jpg — IMAGE_MIME_TYPES has both
    // extensions pointing at the same MIME type, and the reverse lookup
    // keeps whichever is later in that map.
    expect(filename).toBe('cover.jpeg');
    const coverDir = path.join(dir, 'playlist-covers', 'album-1');
    expect(fs.readdirSync(coverDir)).toEqual(['cover.jpeg']);
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
    expect(readTrackLyrics(dir, 'abc', 'ja.vtt')).toEqual({
      source: { filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' },
      text: 'WEBVTT',
    });
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

    expect(readTrackLyrics(dir, 'abc', 'lrclib-42.lrc')).toEqual({
      source: {
        filename: 'lrclib-42.lrc',
        language: 'und',
        kind: 'lrclib',
      },
      text: '[00:01.00]Hello',
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
});

describe('hasSeparation', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-hassep-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is false when nothing has been separated yet', () => {
    expect(hasSeparation(dir, 'abc')).toBe(false);
  });

  it('is false when the separations dir exists but the manifest is empty (interrupted separation)', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    expect(hasSeparation(dir, 'abc')).toBe(false);
  });

  it('is true once the selected result exists on disk', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');
    recordSeparationResult(separationsDir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(hasSeparation(dir, 'abc')).toBe(true);
  });

  it('is false when the manifest points at a result whose file is missing', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    recordSeparationResult(separationsDir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    // recordSeparationResult only writes the manifest — no standard.wav on
    // disk, simulating a result deleted out-of-band.
    expect(hasSeparation(dir, 'abc')).toBe(false);
  });
});

describe('hasSeparationResultFile', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-hassepfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is true only when <presetId>.wav exists in the given dir', () => {
    fs.writeFileSync(path.join(dir, 'standard.wav'), 'x');
    expect(hasSeparationResultFile(dir, 'standard')).toBe(true);
    expect(hasSeparationResultFile(dir, 'inst-hq3')).toBe(false);
  });
});

describe('loadSeparationManifest', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepmanifest-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the empty default when manifest.json does not exist', () => {
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: null,
      results: {},
    });
  });

  it('reads selectedPresetId and results from a valid manifest', () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        selectedPresetId: 'inst-hq3',
        results: {
          standard: {
            modelId: 'kara2',
            separatedAt: '2026-01-01T00:00:00.000Z',
          },
          'inst-hq3': {
            modelId: 'inst-hq3',
            separatedAt: '2026-01-02T00:00:00.000Z',
          },
        },
      }),
    );
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: 'inst-hq3',
      results: {
        standard: { modelId: 'kara2', separatedAt: '2026-01-01T00:00:00.000Z' },
        'inst-hq3': {
          modelId: 'inst-hq3',
          separatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    });
  });

  it('returns the empty default for malformed JSON (hand-edited or corrupt file)', () => {
    fs.writeFileSync(path.join(dir, 'manifest.json'), 'not json{');
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: null,
      results: {},
    });
  });

  it('drops individual result entries missing a modelId rather than discarding the whole manifest', () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        selectedPresetId: 'standard',
        results: { standard: { separatedAt: 'x' }, broken: null },
      }),
    );
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: 'standard',
      results: {},
    });
  });
});

describe('recordSeparationResult', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepresult-test-'));
    fs.mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('adds a result and selects it', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: 'standard',
      results: {
        standard: { modelId: 'kara2', separatedAt: '2026-01-01T00:00:00.000Z' },
      },
    });
  });

  it('a second preset is added alongside the first, not overwriting it, and becomes selected', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    recordSeparationResult(dir, {
      presetId: 'inst-hq3',
      modelId: 'inst-hq3',
      separatedAt: '2026-01-02T00:00:00.000Z',
    });
    const manifest = loadSeparationManifest(dir);
    expect(manifest.selectedPresetId).toBe('inst-hq3');
    expect(Object.keys(manifest.results).sort()).toEqual([
      'inst-hq3',
      'standard',
    ]);
  });

  it('regenerating the same preset overwrites only that entry', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-03T00:00:00.000Z',
    });
    const manifest = loadSeparationManifest(dir);
    expect(Object.keys(manifest.results)).toEqual(['standard']);
    expect(manifest.results.standard.separatedAt).toBe(
      '2026-01-03T00:00:00.000Z',
    );
  });
});

describe('selectSeparationResult', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepselect-test-'));
    fs.mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('switches selectedPresetId when the target preset has a recorded result', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    recordSeparationResult(dir, {
      presetId: 'inst-hq3',
      modelId: 'inst-hq3',
      separatedAt: '2026-01-02T00:00:00.000Z',
    });
    // recordSeparationResult's own most-recent-wins selects inst-hq3 —
    // switch back to prove selectSeparationResult is a real pointer change.
    expect(selectSeparationResult(dir, 'standard')).toBe(true);
    expect(loadSeparationManifest(dir).selectedPresetId).toBe('standard');
  });

  it('refuses and leaves the manifest untouched for a preset with no result', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(selectSeparationResult(dir, 'inst-hq3')).toBe(false);
    expect(loadSeparationManifest(dir).selectedPresetId).toBe('standard');
  });
});

describe('listTracks', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-list-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty array for a nonexistent directory', () => {
    expect(listTracks(path.join(dir, 'does-not-exist'))).toEqual([]);
  });

  it('lists only servable audio files, ignoring others and subdirectories', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'def.flac'), 'y');
    fs.writeFileSync(path.join(dir, 'ignore.txt'), 'z');
    fs.mkdirSync(path.join(dir, 'subdir'));

    const tracks = listTracks(dir).sort((a, b) => a.id.localeCompare(b.id));
    expect(tracks.map((t) => t.id)).toEqual(['abc', 'def']);
    expect(tracks[0].url).toBe('utawakui-media://track/abc/audio.mp3');
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(dir, 'abc.mp3'))).toBe(false);
  });

  it('never lists library.json itself as a track', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', { title: 'x' });
    expect(listTracks(dir)).toHaveLength(1);
  });

  it('merges title/artist/duration from the index and marks it complete', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', {
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    });

    const [track] = listTracks(dir);
    expect(track.title).toBe('夜に駆ける');
    expect(track.artist).toBe('YOASOBI');
    expect(track.duration).toBe(261);
    expect(track.needsBackfill).toBe(false);
  });

  it('merges album/releaseYear from the index but omits needsBackfill for missing album', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', {
      title: 'Track Name',
      artist: 'Some Artist',
      duration: 200,
      album: 'Some Album',
      releaseYear: 2018,
    });

    const [track] = listTracks(dir);
    expect(track.album).toBe('Some Album');
    expect(track.releaseYear).toBe(2018);
    expect(track.needsBackfill).toBe(false);
  });

  it('leaves album/releaseYear undefined without forcing needsBackfill', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', {
      title: 'Track Name',
      artist: 'Some Artist',
      duration: 200,
    });

    const [track] = listTracks(dir);
    expect(track.album).toBeUndefined();
    expect(track.releaseYear).toBeUndefined();
    expect(track.needsBackfill).toBe(false);
  });

  it('lists a legacy (unmigrated) track and dedupes same-stem duplicates when migration cannot move the file', () => {
    fs.writeFileSync(path.join(dir, 'track.flac'), 'x');
    fs.writeFileSync(path.join(dir, 'track.mp3'), 'y');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM: file is locked');
    });

    let tracks;
    try {
      tracks = listTracks(dir);
    } finally {
      renameSpy.mockRestore();
    }

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('track');
    // compareFilenames sorts 'track.flac' before 'track.mp3'; the first
    // sorted file becomes the surviving representative and the same-stem
    // duplicate is deduped away rather than appearing as a second track.
    expect(tracks[0].filename).toBe('track.flac');
    expect(tracks[0].url).toBe('utawakui-media://local/track.flac');
  });

  it('sorts by artist first, then title, then filename fallback', () => {
    fs.writeFileSync(path.join(dir, 'zeta.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'alpha.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'orphan.mp3'), 'x');
    saveIndexEntry(dir, 'zeta', {
      title: 'Second Song',
      artist: 'Beta',
    });
    saveIndexEntry(dir, 'alpha', {
      title: 'First Song',
      artist: 'Alpha',
    });

    expect(listTracks(dir).map((track) => track.id)).toEqual([
      'alpha',
      'zeta',
      'orphan',
    ]);
  });

  it('sorts tracks by title within the same artist', () => {
    fs.writeFileSync(path.join(dir, 'later.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'earlier.mp3'), 'x');
    saveIndexEntry(dir, 'later', {
      title: 'B Song',
      artist: 'Same Artist',
    });
    saveIndexEntry(dir, 'earlier', {
      title: 'A Song',
      artist: 'Same Artist',
    });

    expect(listTracks(dir).map((track) => track.id)).toEqual([
      'earlier',
      'later',
    ]);
  });

  it('falls back to the id for title and needs backfill when unindexed', () => {
    fs.writeFileSync(path.join(dir, 'def.mp3'), 'x');
    const [track] = listTracks(dir);
    expect(track.title).toBe('def');
    expect(track.artist).toBeUndefined();
    expect(track.duration).toBeUndefined();
    expect(track.needsBackfill).toBe(true);
  });

  it('a title-only legacy entry still needs backfill (missing artist/duration)', () => {
    fs.writeFileSync(path.join(dir, 'legacy.mp3'), 'x');
    saveIndexEntry(dir, 'legacy', { title: 'Old Entry' });
    const [track] = listTracks(dir);
    expect(track.title).toBe('Old Entry');
    expect(track.needsBackfill).toBe(true);
  });

  it('never surfaces an orphaned index entry with no matching file', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'orphan', { title: 'Deleted Track' });
    expect(listTracks(dir).map((t) => t.id)).toEqual(['abc']);
  });

  it('deduplicates same-stem audio files so renderer keys and playlist ids do not collide', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'abc.webm'), 'y');

    const tracks = listTracks(dir);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('abc');
    expect(tracks[0].filename).toBe('abc.mp3');
    expect(
      fs.existsSync(path.join(dir, '.duplicates', 'abc', 'abc.webm')),
    ).toBe(true);
  });

  it('reports hasSeparation false and omits stemsUrl when unseparated', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const [track] = listTracks(dir);
    expect(track.hasSeparation).toBe(false);
    expect(track.stemsUrl).toBeUndefined();
    expect(track.separation).toBeUndefined();
  });

  it('migrates a legacy flat stems.wav + separation.json sidecar into the per-preset layout', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'stems.wav'), 'x');
    fs.writeFileSync(
      path.join(trackDir, 'separation.json'),
      JSON.stringify({
        version: 1,
        modelId: 'inst-hq3',
        presetId: 'inst-hq3',
        separatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    const [track] = listTracks(dir);
    expect(track.hasSeparation).toBe(true);
    expect(track.stemsUrl).toBe(
      'utawakui-media://track/abc/separations/inst-hq3.wav',
    );
    expect(track.separation).toEqual({
      selectedPresetId: 'inst-hq3',
      results: {
        'inst-hq3': {
          modelId: 'inst-hq3',
          separatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });
    expect(fs.existsSync(path.join(trackDir, 'stems.wav'))).toBe(false);
    expect(fs.existsSync(path.join(trackDir, 'separation.json'))).toBe(false);
    expect(
      fs.existsSync(path.join(trackDir, 'separations', 'inst-hq3.wav')),
    ).toBe(true);
  });

  it('migrates a legacy stems.wav with no sidecar, falling back to the standard/kara2 guess', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'stems.wav'), 'x');

    const [track] = listTracks(dir);
    expect(track.hasSeparation).toBe(true);
    expect(track.separation.selectedPresetId).toBe('standard');
    expect(track.separation.results.standard.modelId).toBe('kara2');
    expect(
      fs.existsSync(path.join(trackDir, 'separations', 'standard.wav')),
    ).toBe(true);
  });

  it('reports hasSeparation true with stemsUrl once a result exists, without the legacy .separated dir leaking in as a fake track', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const sepDir = path.join(dir, '.separated', 'abc');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');

    const tracks = listTracks(dir);
    expect(tracks).toHaveLength(1);
    const [track] = tracks;
    expect(track.hasSeparation).toBe(true);
    expect(track.stemsUrl).toBe(
      'utawakui-media://track/abc/separations/standard.wav',
    );
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc', 'stems.wav'))).toBe(
      false,
    );
    expect(
      fs.existsSync(
        path.join(dir, 'tracks', 'abc', 'separations', 'standard.wav'),
      ),
    ).toBe(true);
  });

  it('exposes multiple results and lets the selected one drive stemsUrl', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');
    fs.writeFileSync(path.join(separationsDir, 'inst-hq3.wav'), 'y');
    recordSeparationResult(separationsDir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    recordSeparationResult(separationsDir, {
      presetId: 'inst-hq3',
      modelId: 'inst-hq3',
      separatedAt: '2026-01-02T00:00:00.000Z',
    });
    // recordSeparationResult's most-recent-wins already selected inst-hq3
    // — switch back to prove stemsUrl follows the pointer, not creation
    // order.
    selectSeparationResult(separationsDir, 'standard');

    const [track] = listTracks(dir);
    expect(track.stemsUrl).toBe(
      'utawakui-media://track/abc/separations/standard.wav',
    );
    expect(Object.keys(track.separation.results).sort()).toEqual([
      'inst-hq3',
      'standard',
    ]);
    expect(track.separation.selectedPresetId).toBe('standard');
  });

  it('reports thumbnailUrl for structured track artwork', () => {
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'y');

    const [track] = listTracks(dir);
    expect(track.thumbnailUrl).toBe('utawakui-media://track/abc/thumbnail.jpg');
  });

  it('normalizes yt-dlp artwork sidecars before reporting thumbnailUrl', () => {
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'audio.webp'), 'image');

    const [track] = listTracks(dir);

    expect(track.thumbnailUrl).toBe(
      'utawakui-media://track/abc/thumbnail.webp',
    );
    expect(fs.existsSync(path.join(trackDir, 'thumbnail.webp'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'audio.webp'))).toBe(false);
  });

  it('normalizes yt-dlp VTT subtitle sidecars into the lyrics directory', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'audio.ja.vtt'), 'WEBVTT');

    const [track] = listTracks(dir);

    expect(track.lyrics).toEqual({
      status: 'available',
      needsScan: false,
      sources: [{ filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' }],
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'ja.vtt'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'audio.ja.vtt'))).toBe(false);
  });

  it('drops translated yt-dlp VTT sidecars instead of listing them as lyrics', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'audio.ja-zh-TW.vtt'), 'WEBVTT');

    const [track] = listTracks(dir);

    expect(track.lyrics).toEqual({
      status: 'unchecked',
      needsScan: false,
      sources: [],
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'ja-zh-TW.vtt'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(trackDir, 'audio.ja-zh-TW.vtt'))).toBe(
      false,
    );
  });

  it('drops automatic yt-dlp VTT sidecars instead of listing them as lyrics', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'audio.en-orig.vtt'), 'WEBVTT');

    const [track] = listTracks(dir);

    expect(track.lyrics).toEqual({
      status: 'unchecked',
      needsScan: false,
      sources: [],
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'en-orig.vtt'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(trackDir, 'audio.en-orig.vtt'))).toBe(false);
  });

  it('marks a YouTube-id track for backfill when artwork or info is missing', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });

    const [track] = listTracks(dir);

    expect(track.needsBackfill).toBe(true);
  });

  it('marks a YouTube-id track for backfill when lyrics have not been checked yet', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'info.json'), '{}');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'image');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });

    const [track] = listTracks(dir);

    expect(track.needsBackfill).toBe(true);
    expect(track.lyrics).toEqual({
      status: 'unchecked',
      needsScan: false,
      sources: [],
    });
  });

  it('marks tracks scanned with an old lyrics manifest version for one rescan', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    const lyricsDir = path.join(trackDir, 'lyrics');
    fs.mkdirSync(lyricsDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'info.json'), '{}');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'image');
    fs.writeFileSync(path.join(lyricsDir, 'ja.vtt'), 'WEBVTT');
    fs.writeFileSync(
      path.join(lyricsDir, 'lyrics.json'),
      JSON.stringify({
        version: 2,
        checked: true,
        sources: [{ filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' }],
      }),
    );
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });

    const [track] = listTracks(dir);

    expect(track.needsBackfill).toBe(true);
    expect(track.lyrics).toMatchObject({
      status: 'available',
      needsScan: true,
    });
  });

  it('does not require artwork or info backfill for a non-YouTube local track', () => {
    const trackDir = path.join(dir, 'tracks', 'local-song');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'local-song', {
      title: 'Local Song',
      artist: 'Local Artist',
      duration: 120,
    });

    const [track] = listTracks(dir);

    expect(track.needsBackfill).toBe(false);
  });
});

describe('loadIndex', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-index-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty index when the file is missing', () => {
    expect(loadIndex(dir)).toEqual({ version: 2, tracks: {} });
  });

  it('returns an empty index for corrupted JSON', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), '{not valid json');
    expect(loadIndex(dir)).toEqual({ version: 2, tracks: {} });
  });

  it('returns an empty index when the top level is an array', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), JSON.stringify([1, 2, 3]));
    expect(loadIndex(dir)).toEqual({ version: 2, tracks: {} });
  });

  it('returns an empty index when the top level is null', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), JSON.stringify(null));
    expect(loadIndex(dir)).toEqual({ version: 2, tracks: {} });
  });
});

describe('migrateTrackAlbumMetadata', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-migrate-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when there is no existing index file', () => {
    const changed = migrateTrackAlbumMetadata(dir, () => ({ album: 'X' }));
    expect(changed).toBe(false);
    expect(fs.existsSync(path.join(dir, INDEX_FILENAME))).toBe(false);
  });

  it('merges album/releaseYear from the injected reader into each entry', () => {
    fs.writeFileSync(
      path.join(dir, INDEX_FILENAME),
      JSON.stringify({
        version: 1,
        tracks: {
          a: { title: 'Track A', artist: 'Artist A', duration: 200 },
          b: { title: 'Track B', artist: 'Artist B', duration: 210 },
        },
      }),
    );

    const changed = migrateTrackAlbumMetadata(dir, (trackDir) => {
      const id = path.basename(trackDir);
      return id === 'a' ? { album: 'Album A', releaseYear: 2020 } : {};
    });

    expect(changed).toBe(true);
    const index = loadIndex(dir);
    expect(index.version).toBe(2);
    expect(index.tracks.a).toMatchObject({
      album: 'Album A',
      releaseYear: 2020,
    });
    expect(index.tracks.b.album).toBeUndefined();
  });

  it('does nothing and reports unchanged when the index file is corrupt JSON', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), '{ not valid json');

    const changed = migrateTrackAlbumMetadata(dir, () => ({ album: 'X' }));

    expect(changed).toBe(false);
  });

  it('is a no-op once the index is already at the current version', () => {
    fs.writeFileSync(
      path.join(dir, INDEX_FILENAME),
      JSON.stringify({
        version: 2,
        tracks: { a: { title: 'Track A' } },
      }),
    );

    const changed = migrateTrackAlbumMetadata(dir, () => ({
      album: 'Should Not Apply',
    }));

    expect(changed).toBe(false);
    expect(loadIndex(dir).tracks.a.album).toBeUndefined();
  });
});

describe('refreshTrackMetadataFromSidecars', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-refresh-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeStructuredTrack(id) {
    const trackDir = path.join(dir, 'tracks', id);
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    return trackDir;
  }

  it('fills in album/releaseYear from the injected reader, unlike the version-gated migration', () => {
    makeStructuredTrack('a');
    saveIndexEntry(dir, 'a', {
      title: 'Track A',
      artist: 'Artist A',
      duration: 200,
    });

    const updated = refreshTrackMetadataFromSidecars(dir, () => ({
      title: 'Track A',
      artist: 'Artist A',
      duration: 200,
      album: 'Album A',
      releaseYear: 2020,
    }));

    expect(updated).toBe(1);
    expect(loadIndex(dir).tracks.a).toEqual({
      title: 'Track A',
      artist: 'Artist A',
      duration: 200,
      album: 'Album A',
      releaseYear: 2020,
    });
  });

  it('covers a track id that has no library.json entry at all yet', () => {
    makeStructuredTrack('a');

    const updated = refreshTrackMetadataFromSidecars(dir, () => ({
      album: 'Album A',
      releaseYear: 2020,
    }));

    expect(updated).toBe(1);
    expect(loadIndex(dir).tracks.a).toEqual({
      album: 'Album A',
      releaseYear: 2020,
    });
  });

  it('leaves title/artist/duration untouched even though the reader always returns those keys', () => {
    makeStructuredTrack('a');
    saveIndexEntry(dir, 'a', {
      title: 'Real Title',
      artist: 'Real Artist',
      duration: 200,
    });

    // Simulates extractMetadataFields()'s real shape: title/artist/duration
    // keys are always present (undefined here because this sidecar read
    // didn't find them), only album/releaseYear are actually new info.
    refreshTrackMetadataFromSidecars(dir, () => ({
      title: undefined,
      artist: undefined,
      duration: undefined,
      album: 'Album A',
      releaseYear: 2020,
    }));

    expect(loadIndex(dir).tracks.a).toMatchObject({
      title: 'Real Title',
      artist: 'Real Artist',
      duration: 200,
    });
  });

  it('never writes thumbnailUrl into library.json', () => {
    makeStructuredTrack('a');

    refreshTrackMetadataFromSidecars(dir, () => ({
      album: 'Album A',
      releaseYear: 2020,
      thumbnailUrl: 'https://example.com/thumb.jpg',
    }));

    expect(loadIndex(dir).tracks.a.thumbnailUrl).toBeUndefined();
  });

  it('skips a track whose sidecar has neither album nor releaseYear', () => {
    makeStructuredTrack('a');
    saveIndexEntry(dir, 'a', { title: 'Track A' });

    const updated = refreshTrackMetadataFromSidecars(dir, () => ({
      title: 'Track A',
    }));

    expect(updated).toBe(0);
    expect(loadIndex(dir).tracks.a).toEqual({ title: 'Track A' });
  });

  it('is idempotent: a second run reports 0 and does not rewrite the file', () => {
    makeStructuredTrack('a');
    const reader = () => ({ album: 'Album A', releaseYear: 2020 });

    expect(refreshTrackMetadataFromSidecars(dir, reader)).toBe(1);
    const writtenAt = fs.statSync(path.join(dir, INDEX_FILENAME)).mtimeMs;

    const second = refreshTrackMetadataFromSidecars(dir, reader);

    expect(second).toBe(0);
    expect(fs.statSync(path.join(dir, INDEX_FILENAME)).mtimeMs).toBe(writtenAt);
  });

  it('can run again after the index is already at the current version, unlike migrateTrackAlbumMetadata', () => {
    makeStructuredTrack('a');
    fs.writeFileSync(
      path.join(dir, INDEX_FILENAME),
      JSON.stringify({
        version: 2,
        tracks: { a: { title: 'Track A' } },
      }),
    );

    const updated = refreshTrackMetadataFromSidecars(dir, () => ({
      album: 'Album A',
      releaseYear: 2020,
    }));

    expect(updated).toBe(1);
    expect(loadIndex(dir).tracks.a).toMatchObject({
      album: 'Album A',
      releaseYear: 2020,
    });
  });
});

describe('saveIndexEntry', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-save-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes an entry that can be read back', () => {
    saveIndexEntry(dir, 'abc', {
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    });
    expect(loadIndex(dir).tracks.abc).toEqual({
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    });
  });

  it('preserves other entries when saving a new one', () => {
    saveIndexEntry(dir, 'abc', { title: 'First' });
    saveIndexEntry(dir, 'orphan', { title: 'Second' });
    const { tracks } = loadIndex(dir);
    expect(Object.keys(tracks).sort()).toEqual(['abc', 'orphan']);
    expect(tracks.abc).toEqual({ title: 'First' });
  });
});

describe('updateTrackMetadata', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-edit-track-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('updates title and artist while preserving managed import metadata', () => {
    const sourceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-edit-source-test-'),
    );
    const sourcePath = path.join(sourceDir, 'Original.mp3');
    fs.writeFileSync(sourcePath, 'audio');
    const { imported } = importLocalAudioFiles(dir, [sourcePath]);

    const updated = updateTrackMetadata(dir, imported[0].id, {
      title: 'Edited Title',
      artist: 'Edited Artist',
    });

    expect(updated).toMatchObject({
      id: 'Original',
      title: 'Edited Title',
      artist: 'Edited Artist',
      sourceType: 'local-file',
      storageType: 'managed',
      originalFilename: 'Original.mp3',
    });
    expect(loadIndex(dir).tracks.Original).toMatchObject({
      title: 'Edited Title',
      artist: 'Edited Artist',
      sourceType: 'local-file',
      storageType: 'managed',
      originalFilename: 'Original.mp3',
    });

    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('clears artist when the submitted artist is blank', () => {
    fs.mkdirSync(path.join(dir, 'tracks', 'abc'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'abc', {
      title: 'Old Title',
      artist: 'Old Artist',
    });

    updateTrackMetadata(dir, 'abc', {
      title: 'New Title',
      artist: '   ',
    });

    expect(loadIndex(dir).tracks.abc).toEqual({ title: 'New Title' });
    expect(listTracks(dir)[0]).toMatchObject({
      id: 'abc',
      title: 'New Title',
      artist: undefined,
    });
  });

  it('rejects a blank title', () => {
    fs.mkdirSync(path.join(dir, 'tracks', 'abc'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'), 'x');

    expect(() =>
      updateTrackMetadata(dir, 'abc', { title: ' ', artist: 'Artist' }),
    ).toThrow('title is required');
  });

  it('returns null when the track does not exist on disk', () => {
    expect(
      updateTrackMetadata(dir, 'missing', {
        title: 'Title',
        artist: 'Artist',
      }),
    ).toBe(null);
    expect(loadIndex(dir).tracks.missing).toBeUndefined();
  });
});

describe('buildRangeResponse', () => {
  let dir;
  let filePath;
  let content;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-range-test-'));
    filePath = path.join(dir, 'sample.mp3');
    content = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 256));
    fs.writeFileSync(filePath, content);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves the full file with status 200 when there is no Range header', async () => {
    const res = buildRangeResponse(filePath, null);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe(String(content.length));
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content)).toBe(0);
  });

  it('serves a 206 partial response for a Range header', async () => {
    const res = buildRangeResponse(filePath, 'bytes=100-199');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 100-199/${content.length}`,
    );
    expect(res.headers.get('content-length')).toBe('100');
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content.subarray(100, 200))).toBe(0);
  });

  it('serves to end of file for an open-ended Range', async () => {
    const res = buildRangeResponse(filePath, 'bytes=1900-');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 1900-1999/${content.length}`,
    );
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content.subarray(1900, 2000))).toBe(0);
  });

  it('serves the actual file tail for a suffix Range', async () => {
    const res = buildRangeResponse(filePath, 'bytes=-128');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 1872-1999/${content.length}`,
    );
    expect(res.headers.get('content-length')).toBe('128');
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content.subarray(1872, 2000))).toBe(0);
  });

  it('clamps a range end beyond the file size', () => {
    const res = buildRangeResponse(filePath, 'bytes=1990-5000');
    expect(res.headers.get('content-range')).toBe(
      `bytes 1990-1999/${content.length}`,
    );
  });

  it('falls back to a full 200 response for a malformed Range header', () => {
    expect(buildRangeResponse(filePath, 'not-a-range').status).toBe(200);
  });
});

describe('deleteTrack', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-delete-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('removes the audio file and returns true', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(path.join(dir, 'abc.mp3'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc'))).toBe(false);
  });

  it('deletes a legacy (unmigrated) track by its flat file path when migration cannot move it', () => {
    fs.writeFileSync(path.join(dir, 'legacy.mp3'), 'x');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM: file is locked');
    });

    let deleted;
    try {
      deleted = deleteTrack(dir, 'legacy');
    } finally {
      renameSpy.mockRestore();
    }

    expect(deleted).toBe(true);
    expect(fs.existsSync(path.join(dir, 'legacy.mp3'))).toBe(false);
  });

  it('removes the matching .separated/<trackId> directory too', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const sepDir = path.join(dir, '.separated', 'abc');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');

    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(sepDir)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc'))).toBe(false);
  });

  it('removes the library.json entry', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', { title: 'Song' });

    deleteTrack(dir, 'abc');
    expect(loadIndex(dir).tracks.abc).toBeUndefined();
  });

  it('does not touch other tracks or their separated output', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'def.mp3'), 'y');
    const sepDir = path.join(dir, '.separated', 'def');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');

    deleteTrack(dir, 'abc');
    expect(fs.existsSync(path.join(dir, 'tracks', 'def', 'audio.mp3'))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(dir, 'tracks', 'def', 'separations', 'standard.wav'),
      ),
    ).toBe(true);
  });

  it('removes everything under separations/ (per-preset results + manifest) when deleting a track', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');
    fs.writeFileSync(path.join(separationsDir, 'inst-hq3.wav'), 'y');
    recordSeparationResult(separationsDir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(separationsDir)).toBe(false);
  });

  it('returns false and touches nothing when trackId has no matching file', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    expect(deleteTrack(dir, 'missing')).toBe(false);
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'))).toBe(
      true,
    );
  });

  it('deletes the same deterministic representative listTracks exposes for duplicate stems', () => {
    fs.writeFileSync(path.join(dir, 'abc.webm'), 'y');
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');

    expect(listTracks(dir)[0].filename).toBe('abc.mp3');
    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc'))).toBe(false);
    expect(
      fs.existsSync(path.join(dir, '.duplicates', 'abc', 'abc.webm')),
    ).toBe(true);
  });
});

describe('runBackfillPass', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-backfill-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports "already running" and skips a second concurrent pass', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    let releaseFirst;
    const fetchMetadata = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve({ title: 'Title', artist: 'Artist', duration: 100 });
        }),
    );
    const onStatus = vi.fn();

    const firstPass = runBackfillPass(dir, listTracks(dir), fetchMetadata);
    // The first pass is now in flight (backfillInProgress === true).
    const secondResult = await runBackfillPass(
      dir,
      listTracks(dir),
      fetchMetadata,
      onStatus,
    );

    expect(secondResult).toBe(false);
    expect(onStatus).toHaveBeenCalledWith({
      stage: 'running',
      isRunning: true,
    });
    expect(fetchMetadata).toHaveBeenCalledTimes(1);

    releaseFirst();
    await firstPass;
  });

  it('only queries ids that look like real YouTube video ids', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    fs.writeFileSync(path.join(dir, '夜に駆ける.mp3'), 'x');

    const fetchMetadata = vi.fn(async () => ({
      title: 'Title',
      artist: 'Artist',
      duration: 100,
    }));

    const updated = await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    expect(updated).toBe(true);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchMetadata).toHaveBeenCalledWith(
      'dQw4w9WgXcQ',
      path.join(dir, 'tracks', 'dQw4w9WgXcQ'),
    );
  });

  it('queries a YouTube-id track again when only thumbnail or info is missing', async () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
    const fetchMetadata = vi.fn(async () => ({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    }));

    const updated = await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    expect(updated).toBe(true);
    expect(fetchMetadata).toHaveBeenCalledWith('dQw4w9WgXcQ', trackDir);
  });

  it('treats thumbnail-only backfill as an update without writing asset flags into library.json', async () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
    const fetchMetadata = vi.fn(async () => ({ assetsUpdated: true }));

    const updated = await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    expect(updated).toBe(true);
    expect(loadIndex(dir).tracks.dQw4w9WgXcQ).toEqual({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
  });

  it('treats lyrics scan completion as an update even when subtitles are missing', async () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'info.json'), '{}');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'image');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
    const fetchMetadata = vi.fn(async () => ({ assetsUpdated: true }));

    const updated = await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    expect(updated).toBe(true);
    expect(fetchMetadata).toHaveBeenCalledWith('dQw4w9WgXcQ', trackDir);
    expect(loadIndex(dir).tracks.dQw4w9WgXcQ).toEqual({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
  });

  it('reports backfill progress while traversing reload candidates', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    const fetchMetadata = vi.fn(async () => ({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    }));
    const onStatus = vi.fn();

    await runBackfillPass(dir, listTracks(dir), fetchMetadata, onStatus);

    expect(onStatus).toHaveBeenCalledWith({
      stage: 'start',
      isRunning: true,
      total: 1,
      completed: 0,
    });
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'track',
        isRunning: true,
        total: 1,
        completed: 0,
        trackId: 'dQw4w9WgXcQ',
      }),
    );
    expect(onStatus).toHaveBeenLastCalledWith({
      stage: 'done',
      isRunning: false,
      total: 1,
      completed: 1,
      updated: true,
    });
  });

  it('writes back title/artist/duration on a successful lookup', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    const fetchMetadata = vi.fn(async () => ({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    }));

    await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    const [track] = listTracks(dir);
    expect(track.title).toBe('Never Gonna Give You Up');
    expect(track.artist).toBe('Rick Astley');
    expect(track.duration).toBe(213);
  });

  it('does not clobber a title edited concurrently while the fetch was in flight', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    const fetchMetadata = vi.fn(async () => {
      saveIndexEntry(dir, 'dQw4w9WgXcQ', { title: 'User Edited Title' });
      return {
        title: 'Fetched Title',
        artist: 'Fetched Artist',
        duration: 213,
      };
    });

    await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    const [track] = listTracks(dir);
    expect(track.title).toBe('User Edited Title');
    expect(track.artist).toBe('Fetched Artist');
    expect(track.duration).toBe(213);
  });

  it('does not retry an id that already failed this session', async () => {
    fs.writeFileSync(path.join(dir, 'aaaaaaaaaaa.mp3'), 'x');
    const fetchMetadata = vi.fn(async () => null);

    const first = await runBackfillPass(dir, listTracks(dir), fetchMetadata);
    expect(first).toBe(false);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);

    fetchMetadata.mockClear();
    const second = await runBackfillPass(dir, listTracks(dir), fetchMetadata);
    expect(second).toBe(false);
    expect(fetchMetadata).not.toHaveBeenCalled();
  });
});

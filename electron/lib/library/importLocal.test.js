import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  convertLocalAudioFiles,
  importLocalAudioFiles,
} from './importLocal.js';
import { listTracks } from './tracks.js';
import { loadIndex, saveIndexEntry } from './metadataIndex.js';

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function pngHeader(width = 64, height = 64) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12, 4, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function importOptions(metadata = { duration: 1 }) {
  return {
    readAudioMetadata: vi.fn().mockResolvedValue(metadata),
  };
}

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
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('copies local audio into a structured track folder and records managed import metadata', async () => {
    const sourcePath = path.join(sourceDir, '夜に駆ける.mp3');
    fs.writeFileSync(sourcePath, 'audio-bytes');

    const artwork = pngHeader();
    const options = importOptions({
      duration: 123.5,
      title: 'Tagged title',
      artist: 'Tagged artist',
      album: 'Tagged album',
      releaseYear: 2024,
      artwork: { extension: '.png', buffer: artwork },
    });

    const result = await importLocalAudioFiles(dir, [sourcePath], options);

    expect(result).toEqual({
      imported: [{ id: '夜に駆ける', title: 'Tagged title' }],
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
      title: 'Tagged title',
      artist: 'Tagged artist',
      album: 'Tagged album',
      releaseYear: 2024,
      duration: 123.5,
      titleOrigin: 'file-tag',
      artistOrigin: 'file-tag',
      sourceType: 'local-file',
      storageType: 'managed',
      audioFilename: 'audio.mp3',
      originalFilename: '夜に駆ける.mp3',
      importedAt: expect.any(String),
      fileSize: Buffer.byteLength('audio-bytes'),
      contentHash: sha256Text('audio-bytes'),
    });
    expect(
      fs.readFileSync(path.join(dir, 'tracks', '夜に駆ける', 'thumbnail.png')),
    ).toEqual(artwork);
    expect(Date.parse(indexed.importedAt)).not.toBeNaN();
    expect(indexed).not.toHaveProperty('originalPath');
    expect(listTracks(dir)[0]).toMatchObject({
      id: '夜に駆ける',
      title: 'Tagged title',
      artist: 'Tagged artist',
      album: 'Tagged album',
      releaseYear: 2024,
      duration: 123.5,
      sourceType: 'local-file',
      storageType: 'managed',
      originalFilename: '夜に駆ける.mp3',
      importedAt: indexed.importedAt,
      fileSize: Buffer.byteLength('audio-bytes'),
      contentHash: sha256Text('audio-bytes'),
      thumbnailUrl:
        'utawakui-media://track/%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B/thumbnail.png',
      url: 'utawakui-media://track/%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B/audio.mp3',
    });
  });

  it('imports duplicate filename stems under unique track ids without overwriting', async () => {
    const first = path.join(sourceDir, 'Song.mp3');
    const second = path.join(sourceDir, 'Song.webm');
    fs.writeFileSync(first, 'first');
    fs.writeFileSync(second, 'second');

    const result = await importLocalAudioFiles(
      dir,
      [first, second],
      importOptions(),
    );

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

  it('skips duplicate local audio by content hash across filenames', async () => {
    const first = path.join(sourceDir, 'Alpha.mp3');
    const second = path.join(sourceDir, 'Renamed Copy.flac');
    fs.writeFileSync(first, 'same-audio-bytes');
    fs.writeFileSync(second, 'same-audio-bytes');

    const result = await importLocalAudioFiles(
      dir,
      [first, second],
      importOptions(),
    );

    expect(result.imported).toEqual([{ id: 'Alpha', title: 'Alpha' }]);
    expect(result.skipped).toEqual([
      {
        filename: 'Renamed Copy.flac',
        reason: 'duplicate-content',
        existingTrackId: 'Alpha',
      },
    ]);
    expect(fs.existsSync(path.join(dir, 'tracks', 'Renamed Copy'))).toBe(false);
    expect(Object.keys(loadIndex(dir).tracks)).toEqual(['Alpha']);
  });

  it('backfills missing local content hashes before checking new imports', async () => {
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

    const result = await importLocalAudioFiles(
      dir,
      [sourcePath],
      importOptions(),
    );

    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([
      {
        filename: 'Existing Copy.wav',
        reason: 'duplicate-content',
        existingTrackId: 'Existing',
      },
    ]);
    expect(loadIndex(dir).tracks.Existing.contentHash).toBe(
      sha256Text('existing-audio'),
    );
  });

  it('skips non-audio sources and missing files without throwing', async () => {
    const textPath = path.join(sourceDir, 'notes.txt');
    const missingPath = path.join(sourceDir, 'missing.mp3');
    fs.writeFileSync(textPath, 'not audio');

    const options = importOptions();
    const result = await importLocalAudioFiles(
      dir,
      [textPath, missingPath],
      options,
    );

    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([
      { filename: 'notes.txt', reason: 'unsupported-extension' },
      { filename: 'missing.mp3', reason: 'missing-file' },
    ]);
    expect(options.readAudioMetadata).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'tracks'))).toBe(false);
  });

  it('rejects invalid path values and directories without invoking the metadata reader', async () => {
    const directoryPath = path.join(sourceDir, 'Folder.mp3');
    fs.mkdirSync(directoryPath);
    const options = importOptions();

    const result = await importLocalAudioFiles(
      dir,
      [null, '', directoryPath],
      options,
    );

    expect(result).toEqual({
      imported: [],
      skipped: [
        { filename: '未知檔案', reason: 'invalid-path' },
        { filename: '未知檔案', reason: 'invalid-path' },
        { filename: 'Folder.mp3', reason: 'not-a-file' },
      ],
    });
    expect(options.readAudioMetadata).not.toHaveBeenCalled();
  });

  it('returns an empty result for non-array input with default options', async () => {
    await expect(importLocalAudioFiles(dir, null)).resolves.toEqual({
      imported: [],
      skipped: [],
    });
  });

  it('returns only bounded public failure data while preserving private diagnostics', async () => {
    const sourcePath = path.join(sourceDir, 'Broken.mp3');
    fs.writeFileSync(sourcePath, 'not audio');
    const privateError = Object.assign(
      new Error(`Invalid audio at ${sourcePath}`),
      { code: 'invalid-audio' },
    );
    const onFailure = vi.fn();

    const result = await importLocalAudioFiles(dir, [sourcePath], {
      readAudioMetadata: vi.fn().mockRejectedValue(privateError),
      onFailure,
    });

    expect(result).toEqual({
      imported: [],
      skipped: [{ filename: 'Broken.mp3', reason: 'invalid-audio' }],
    });
    expect(JSON.stringify(result)).not.toContain(sourceDir);
    expect(JSON.stringify(result)).not.toContain('Invalid audio');
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath,
        reason: 'invalid-audio',
        error: privateError,
      }),
    );
  });

  it.each(['unsupported-codec', 'unsupported-media'])(
    'preserves the bounded %s reason for a future compatibility action',
    async (code) => {
      const sourcePath = path.join(sourceDir, 'Unsupported.m4a');
      fs.writeFileSync(sourcePath, 'audio');
      const privateError = Object.assign(new Error('private codec details'), {
        code,
      });

      await expect(
        importLocalAudioFiles(dir, [sourcePath], {
          readAudioMetadata: vi.fn().mockRejectedValue(privateError),
        }),
      ).resolves.toEqual({
        imported: [],
        skipped: [{ filename: 'Unsupported.m4a', reason: code }],
      });
    },
  );

  it('returns a bounded review item while keeping a WMA source path in Main', async () => {
    const sourcePath = path.join(sourceDir, 'Legacy recording.wma');
    fs.writeFileSync(sourcePath, 'wma-audio');
    const onConversionCandidate = vi.fn();
    const parseAudioMetadata = vi.fn().mockResolvedValue({
      kind: 'conversion',
      sourceFormat: 'wma',
      metadata: { duration: 12 },
    });

    const result = await importLocalAudioFiles(dir, [sourcePath], {
      parseAudioMetadata,
      onConversionCandidate,
    });

    expect(result).toEqual({
      imported: [],
      skipped: [],
      conversionRequired: [
        { filename: 'Legacy recording.wma', sourceFormat: 'wma' },
      ],
    });
    expect(parseAudioMetadata).toHaveBeenCalledWith(sourcePath, '.wma');
    expect(onConversionCandidate).toHaveBeenCalledWith({
      sourcePath,
      sourceFormat: 'wma',
    });
    expect(JSON.stringify(result)).not.toContain(sourceDir);
  });

  it('routes M4A/ALAC to conversion review after staged direct validation', async () => {
    const sourcePath = path.join(sourceDir, 'Lossless.m4a');
    fs.writeFileSync(sourcePath, 'alac-audio');
    const onConversionCandidate = vi.fn();
    const conversionRequired = Object.assign(
      new Error('private codec details'),
      { code: 'conversion-required', sourceFormat: 'alac' },
    );

    const result = await importLocalAudioFiles(dir, [sourcePath], {
      readAudioMetadata: vi.fn().mockRejectedValue(conversionRequired),
      onConversionCandidate,
    });

    expect(result).toEqual({
      imported: [],
      skipped: [],
      conversionRequired: [{ filename: 'Lossless.m4a', sourceFormat: 'alac' }],
    });
    expect(onConversionCandidate).toHaveBeenCalledWith({
      sourcePath,
      sourceFormat: 'alac',
    });
    expect(fs.existsSync(path.join(dir, '.import-staging'))).toBe(true);
    expect(fs.readdirSync(path.join(dir, '.import-staging'))).toEqual([]);
  });

  it('keeps invalid recognized extensions out of conversion review', async () => {
    const sourcePath = path.join(sourceDir, 'Renamed.wma');
    fs.writeFileSync(sourcePath, 'not-wma');
    const mismatch = Object.assign(new Error('private parser details'), {
      code: 'format-mismatch',
    });
    const onConversionCandidate = vi.fn();

    await expect(
      importLocalAudioFiles(dir, [sourcePath], {
        parseAudioMetadata: vi.fn().mockRejectedValue(mismatch),
        onConversionCandidate,
      }),
    ).resolves.toEqual({
      imported: [],
      skipped: [{ filename: 'Renamed.wma', reason: 'format-mismatch' }],
    });
    expect(onConversionCandidate).not.toHaveBeenCalled();
  });

  it('keeps a per-file result when the optional diagnostic callback throws', async () => {
    const sourcePath = path.join(sourceDir, 'Diagnostic.wav');
    fs.writeFileSync(sourcePath, 'not audio');
    const parserError = Object.assign(new Error('private parser error'), {
      code: 'invalid-audio',
    });

    await expect(
      importLocalAudioFiles(dir, [sourcePath], {
        readAudioMetadata: vi.fn().mockRejectedValue(parserError),
        onFailure: vi.fn(() => {
          throw new Error('diagnostics unavailable');
        }),
      }),
    ).resolves.toEqual({
      imported: [],
      skipped: [{ filename: 'Diagnostic.wav', reason: 'invalid-audio' }],
    });
  });

  it('keeps the bounded result when staging cleanup fails and reports that failure privately', async () => {
    const sourcePath = path.join(sourceDir, 'Cleanup.wav');
    fs.writeFileSync(sourcePath, 'not audio');
    const parserError = Object.assign(new Error('private parser error'), {
      code: 'invalid-audio',
    });
    const cleanupError = new Error(`cannot remove staging data at ${dir}`);
    vi.spyOn(fs.promises, 'rm').mockRejectedValueOnce(cleanupError);
    const onFailure = vi.fn();

    await expect(
      importLocalAudioFiles(dir, [sourcePath], {
        readAudioMetadata: vi.fn().mockRejectedValue(parserError),
        onFailure,
      }),
    ).resolves.toEqual({
      imported: [],
      skipped: [{ filename: 'Cleanup.wav', reason: 'invalid-audio' }],
    });
    expect(onFailure).toHaveBeenCalledWith({
      sourcePath,
      reason: 'cleanup-failed',
      error: cleanupError,
    });
  });

  it('rolls back the managed track directory when index persistence fails', async () => {
    const sourcePath = path.join(sourceDir, 'Rollback.wav');
    fs.writeFileSync(sourcePath, 'audio');
    const onFailure = vi.fn();

    const result = await importLocalAudioFiles(dir, [sourcePath], {
      ...importOptions(),
      persistIndexEntry: vi.fn(() => {
        throw new Error(`index write failed at ${dir}`);
      }),
      onFailure,
    });

    expect(result).toEqual({
      imported: [],
      skipped: [{ filename: 'Rollback.wav', reason: 'import-failed' }],
    });
    expect(fs.existsSync(path.join(dir, 'tracks', 'Rollback'))).toBe(false);
    expect(loadIndex(dir).tracks).toEqual({});
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath,
        reason: 'import-failed',
        error: expect.any(Error),
      }),
    );
  });
});

describe('convertLocalAudioFiles', () => {
  let dir;
  let sourceDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-convert-test-'));
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-convert-src-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('converts a reviewed source to validated managed FLAC with bounded provenance', async () => {
    const sourcePath = path.join(sourceDir, 'Archive song.wma');
    fs.writeFileSync(sourcePath, 'source-wma');
    const artwork = pngHeader();
    const parseAudioMetadata = vi.fn().mockResolvedValue({
      kind: 'conversion',
      sourceFormat: 'wma',
      metadata: {
        duration: 120,
        title: 'Archive title',
        artist: 'Archive artist',
        artwork: { extension: '.png', buffer: artwork },
      },
    });
    const readAudioMetadata = vi.fn().mockResolvedValue({ duration: 119.8 });
    const createTranscodeJob = vi.fn(({ inputPath, outputPath }) => {
      expect(inputPath).toBe(sourcePath);
      fs.writeFileSync(outputPath, 'converted-flac');
      return { result: Promise.resolve(outputPath), cancel: vi.fn() };
    });

    const result = await convertLocalAudioFiles(
      dir,
      [{ sourcePath, sourceFormat: 'wma' }],
      {
        ffmpegPath: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
        parseAudioMetadata,
        readAudioMetadata,
        createTranscodeJob,
      },
    );

    expect(result).toEqual({
      imported: [{ id: 'Archive song', title: 'Archive title' }],
      skipped: [],
    });
    expect(createTranscodeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        ffmpegPath: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
        inputPath: sourcePath,
        outputPath: expect.stringMatching(/audio\.flac$/u),
      }),
    );
    expect(
      fs.readFileSync(
        path.join(dir, 'tracks', 'Archive song', 'audio.flac'),
        'utf8',
      ),
    ).toBe('converted-flac');
    expect(
      fs.readFileSync(
        path.join(dir, 'tracks', 'Archive song', 'thumbnail.png'),
      ),
    ).toEqual(artwork);
    expect(loadIndex(dir).tracks['Archive song']).toMatchObject({
      title: 'Archive title',
      artist: 'Archive artist',
      duration: 119.8,
      sourceType: 'local-file',
      storageType: 'managed',
      audioFilename: 'audio.flac',
      originalFilename: 'Archive song.wma',
      sourceFormat: 'wma',
      conversionFormat: 'flac',
      fileSize: Buffer.byteLength('converted-flac'),
      contentHash: sha256Text('converted-flac'),
    });
  });

  it('rejects a changed review source without starting FFmpeg', async () => {
    const sourcePath = path.join(sourceDir, 'Changed.wma');
    fs.writeFileSync(sourcePath, 'source-wma');
    const createTranscodeJob = vi.fn();

    await expect(
      convertLocalAudioFiles(dir, [{ sourcePath, sourceFormat: 'wma' }], {
        ffmpegPath: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
        parseAudioMetadata: vi.fn().mockResolvedValue({
          kind: 'conversion',
          sourceFormat: 'aiff',
          metadata: { duration: 1 },
        }),
        createTranscodeJob,
      }),
    ).resolves.toEqual({
      imported: [],
      skipped: [{ filename: 'Changed.wma', reason: 'source-changed' }],
    });
    expect(createTranscodeJob).not.toHaveBeenCalled();
  });

  it('rolls back a failed conversion and returns no process details', async () => {
    const sourcePath = path.join(sourceDir, 'Broken.ape');
    fs.writeFileSync(sourcePath, 'source-ape');
    const privateError = new Error(
      `ffmpeg failed at ${sourcePath} with private arguments`,
    );
    const onFailure = vi.fn();

    const result = await convertLocalAudioFiles(
      dir,
      [{ sourcePath, sourceFormat: 'ape' }],
      {
        ffmpegPath: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
        parseAudioMetadata: vi.fn().mockResolvedValue({
          kind: 'conversion',
          sourceFormat: 'ape',
          metadata: { duration: 1 },
        }),
        createTranscodeJob: vi.fn(() => ({
          result: Promise.reject(privateError),
          cancel: vi.fn(),
        })),
        onFailure,
      },
    );

    expect(result).toEqual({
      imported: [],
      skipped: [{ filename: 'Broken.ape', reason: 'conversion-failed' }],
    });
    expect(JSON.stringify(result)).not.toContain(sourceDir);
    expect(fs.existsSync(path.join(dir, 'tracks', 'Broken'))).toBe(false);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath,
        reason: 'conversion-failed',
        error: privateError,
      }),
    );
  });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { importLocalAudioFiles } from './importLocal.js';
import { listTracks } from './tracks.js';
import { loadIndex, saveIndexEntry } from './metadataIndex.js';

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isServableFilename,
  isArtworkFilename,
  isLyricsSubtitleFilename,
  resolveTrackPath,
  resolveTrackDir,
  resolveTrackAudioPath,
  resolveTrackArtworkPath,
  resolveTrackAssetPath,
} from './paths.js';

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
    expect(resolveTrackArtworkPath(dir, 'abc')).toBe(
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
    expect(resolveTrackArtworkPath(dir, '../abc')).toBe(null);
  });
});

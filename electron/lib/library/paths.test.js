import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isServableFilename,
  isSafeTrackId,
  isBoundedTrackId,
  isArtworkFilename,
  isLyricsSubtitleFilename,
  resolveTrackPath,
  resolveTrackDir,
  resolveTrackAudioPath,
  resolveTrackArtworkPath,
  resolveTrackAssetPath,
} from './paths.js';

describe('Windows library name boundary', () => {
  it.each([
    'private.txt:audio.mp3',
    'track:stream',
    'track\u0000',
    'track\n',
    'track\u007f',
    'track.',
    'track ',
    '.. ',
    'CON',
    'nul.mp3',
    'COM1',
    'lpt9.mp3',
    'COM¹',
    'LPT².wav',
    'track?',
    'track*',
    'track|pipe',
    'track"quote',
    'track<name>',
  ])('rejects non-file Windows segments before resolving: %j', (name) => {
    expect(isSafeTrackId(name)).toBe(false);
    expect(isBoundedTrackId(name)).toBe(false);
    expect(resolveTrackDir('library', name)).toBeNull();
  });

  it.each(['曲目 01', 'Seven (feat. Latto)', '.hidden', 'COM10', 'CONcert'])(
    'preserves ordinary Unicode and legacy names: %s',
    (name) => {
      expect(isSafeTrackId(name)).toBe(true);
      expect(isBoundedTrackId(name)).toBe(true);
      expect(resolveTrackDir('library', name)).not.toBeNull();
    },
  );

  it.each(['private.txt:audio.mp3', 'nul.mp3', 'COM¹.wav', 'bad\u0000.mp3'])(
    'does not treat a device, stream or malformed name as audio: %j',
    (name) => {
      expect(isServableFilename(name)).toBe(false);
      expect(resolveTrackPath('library', name)).toBeNull();
    },
  );

  it.runIf(process.platform === 'win32')(
    'rejects a real NTFS alternate stream despite its audio extension',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-ads-'));
      try {
        const base = path.join(dir, 'private.txt');
        fs.writeFileSync(base, 'ordinary file');
        fs.writeFileSync(`${base}:audio.mp3`, 'hidden stream');
        // Verify the fixture is an alternate stream, not a colon-named file.
        expect(fs.readFileSync(`${base}:audio.mp3`, 'utf8')).toBe(
          'hidden stream',
        );
        expect(fs.readdirSync(dir)).toEqual(['private.txt']);
        expect(resolveTrackPath(dir, 'private.txt:audio.mp3')).toBeNull();
        expect(fs.readFileSync(base, 'utf8')).toBe('ordinary file');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

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
    expect(isLyricsSubtitleFilename('NUL.vtt')).toBe(false);
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

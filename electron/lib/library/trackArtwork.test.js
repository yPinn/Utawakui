import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  writeTrackArtworkFile,
  writeTrackArtworkBuffer,
  deleteTrackArtworkFile,
} from './trackArtwork.js';
import { resolveTrackAssetPath } from './paths.js';
import { listTracks } from './tracks.js';
import { importLocalAudioFiles } from './importLocal.js';
import { loadIndex } from './metadataIndex.js';

describe('writeTrackArtworkFile / deleteTrackArtworkFile', () => {
  let dir;
  let sourceDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-track-art-test-'));
    sourceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-track-art-src-'),
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  function importTrack() {
    const sourcePath = path.join(sourceDir, 'Local Song.mp3');
    fs.writeFileSync(sourcePath, 'audio');
    return importLocalAudioFiles(dir, [sourcePath]).imported[0];
  }

  it('copies a chosen image into tracks/<id>/thumbnail.<ext> and exposes it through listTracks', () => {
    const track = importTrack();
    const imagePath = path.join(sourceDir, 'picked.png');
    fs.writeFileSync(imagePath, 'image-bytes');

    const filename = writeTrackArtworkFile(dir, track.id, imagePath);

    expect(filename).toBe('thumbnail.png');
    expect(
      fs.readFileSync(
        path.join(dir, 'tracks', track.id, 'thumbnail.png'),
        'utf8',
      ),
    ).toBe('image-bytes');
    expect(listTracks(dir)[0]).toMatchObject({
      id: track.id,
      thumbnailUrl: 'utawakui-media://track/Local%20Song/thumbnail.png',
    });
    expect(resolveTrackAssetPath(dir, track.id, 'thumbnail.png')).toBe(
      path.join(path.resolve(dir), 'tracks', track.id, 'thumbnail.png'),
    );
    expect(loadIndex(dir).tracks[track.id].thumbnailUrl).toBeUndefined();
  });

  it('replaces a previous thumbnail of a different extension instead of leaving both', () => {
    const track = importTrack();
    fs.writeFileSync(path.join(sourceDir, 'first.png'), 'a');
    fs.writeFileSync(path.join(sourceDir, 'second.jpg'), 'b');

    writeTrackArtworkFile(dir, track.id, path.join(sourceDir, 'first.png'));
    const filename = writeTrackArtworkFile(
      dir,
      track.id,
      path.join(sourceDir, 'second.jpg'),
    );

    expect(filename).toBe('thumbnail.jpg');
    expect(fs.readdirSync(path.join(dir, 'tracks', track.id)).sort()).toEqual([
      'audio.mp3',
      'thumbnail.jpg',
    ]);
  });

  it('writes validated online bytes with minimal provenance outside library.json', () => {
    const track = importTrack();
    const provenance = {
      schemaVersion: 1,
      source: 'cover-art-archive',
      provider: 'musicbrainz',
      recordingMbid: '11111111-1111-4111-8111-111111111111',
      releaseGroupMbid: '22222222-2222-4222-8222-222222222222',
      releaseMbid: '33333333-3333-4333-8333-333333333333',
      selectedAt: '2026-09-27T00:00:00.000Z',
      sourcePage:
        'https://musicbrainz.org/release/33333333-3333-4333-8333-333333333333',
    };

    expect(
      writeTrackArtworkBuffer(
        dir,
        track.id,
        Buffer.from('online-image'),
        '.jpg',
        provenance,
      ),
    ).toBe('thumbnail.jpg');
    expect(
      fs.readFileSync(
        path.join(dir, 'tracks', track.id, 'thumbnail.jpg'),
        'utf8',
      ),
    ).toBe('online-image');
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(dir, 'tracks', track.id, 'artwork.json'),
          'utf8',
        ),
      ),
    ).toEqual(provenance);
    expect(loadIndex(dir).tracks[track.id]).not.toHaveProperty('artwork');
  });

  it('removes stale online provenance when a local image replaces it or artwork is cleared', () => {
    const track = importTrack();
    const trackDir = path.join(dir, 'tracks', track.id);
    writeTrackArtworkBuffer(
      dir,
      track.id,
      Buffer.from('online-image'),
      '.jpg',
      {
        schemaVersion: 1,
        source: 'cover-art-archive',
        provider: 'musicbrainz',
        releaseGroupMbid: '22222222-2222-4222-8222-222222222222',
        selectedAt: '2026-09-27T00:00:00.000Z',
        sourcePage:
          'https://musicbrainz.org/release-group/22222222-2222-4222-8222-222222222222',
      },
    );
    const local = path.join(sourceDir, 'local.png');
    fs.writeFileSync(local, 'local-image');

    writeTrackArtworkFile(dir, track.id, local);
    expect(fs.existsSync(path.join(trackDir, 'artwork.json'))).toBe(false);

    fs.writeFileSync(path.join(trackDir, 'artwork.json'), '{}');
    expect(deleteTrackArtworkFile(dir, track.id)).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'artwork.json'))).toBe(false);
  });

  it('removes old provenance before mutating local artwork', () => {
    const track = importTrack();
    const trackDir = path.join(dir, 'tracks', track.id);
    writeTrackArtworkBuffer(
      dir,
      track.id,
      Buffer.from('online-image'),
      '.jpg',
      {
        schemaVersion: 1,
        source: 'cover-art-archive',
        provider: 'musicbrainz',
        releaseGroupMbid: '22222222-2222-4222-8222-222222222222',
        selectedAt: '2026-09-27T00:00:00.000Z',
        sourcePage:
          'https://musicbrainz.org/release-group/22222222-2222-4222-8222-222222222222',
      },
    );
    const local = path.join(sourceDir, 'local.png');
    fs.writeFileSync(local, 'local-image');
    const originalRmSync = fs.rmSync;
    const rmSync = vi
      .spyOn(fs, 'rmSync')
      .mockImplementation((target, options) => {
        if (target === path.join(trackDir, 'artwork.json')) {
          throw new Error('provenance cleanup failed');
        }
        return originalRmSync(target, options);
      });

    try {
      expect(() => writeTrackArtworkFile(dir, track.id, local)).toThrow(
        'provenance cleanup failed',
      );
    } finally {
      rmSync.mockRestore();
    }
    expect(fs.readFileSync(path.join(trackDir, 'thumbnail.jpg'), 'utf8')).toBe(
      'online-image',
    );
    expect(fs.existsSync(path.join(trackDir, 'thumbnail.png'))).toBe(false);
  });

  it('never leaves old attribution when new provenance persistence fails', () => {
    const track = importTrack();
    const trackDir = path.join(dir, 'tracks', track.id);
    const firstProvenance = {
      schemaVersion: 1,
      source: 'cover-art-archive',
      provider: 'musicbrainz',
      releaseGroupMbid: '22222222-2222-4222-8222-222222222222',
      selectedAt: '2026-09-27T00:00:00.000Z',
      sourcePage:
        'https://musicbrainz.org/release-group/22222222-2222-4222-8222-222222222222',
    };
    writeTrackArtworkBuffer(
      dir,
      track.id,
      Buffer.from('first-image'),
      '.jpg',
      firstProvenance,
    );
    const originalRenameSync = fs.renameSync;
    const renameSync = vi
      .spyOn(fs, 'renameSync')
      .mockImplementation((oldPath, newPath) => {
        if (newPath === path.join(trackDir, 'artwork.json')) {
          throw new Error('provenance write failed');
        }
        return originalRenameSync(oldPath, newPath);
      });

    try {
      expect(() =>
        writeTrackArtworkBuffer(
          dir,
          track.id,
          Buffer.from('second-image'),
          '.png',
          {
            ...firstProvenance,
            releaseGroupMbid: '33333333-3333-4333-8333-333333333333',
          },
        ),
      ).toThrow('provenance write failed');
    } finally {
      renameSync.mockRestore();
    }
    expect(fs.existsSync(path.join(trackDir, 'artwork.json'))).toBe(false);
  });

  it('rejects unbounded bytes, unsupported extensions, and invalid provenance', () => {
    const track = importTrack();
    const validProvenance = {
      schemaVersion: 1,
      source: 'cover-art-archive',
      provider: 'musicbrainz',
      releaseGroupMbid: '22222222-2222-4222-8222-222222222222',
      selectedAt: '2026-09-27T00:00:00.000Z',
      sourcePage:
        'https://musicbrainz.org/release-group/22222222-2222-4222-8222-222222222222',
    };
    expect(
      writeTrackArtworkBuffer(
        dir,
        track.id,
        Buffer.alloc(10 * 1024 * 1024 + 1),
        '.jpg',
        validProvenance,
      ),
    ).toBe(null);
    expect(
      writeTrackArtworkBuffer(
        dir,
        track.id,
        Buffer.from('x'),
        '.gif',
        validProvenance,
      ),
    ).toBe(null);
    expect(
      writeTrackArtworkBuffer(dir, track.id, Buffer.from('x'), '.jpg', {
        ...validProvenance,
        sourcePage: 'https://evil.example/release/x',
      }),
    ).toBe(null);
  });

  it('rejects non-image sources and unsafe track ids', () => {
    const track = importTrack();
    fs.writeFileSync(path.join(sourceDir, 'notes.txt'), 'nope');
    fs.writeFileSync(path.join(sourceDir, 'ok.png'), 'image');

    expect(
      writeTrackArtworkFile(dir, track.id, path.join(sourceDir, 'notes.txt')),
    ).toBe(null);
    expect(
      writeTrackArtworkFile(dir, '../evil', path.join(sourceDir, 'ok.png')),
    ).toBe(null);
    expect(
      writeTrackArtworkFile(dir, 'missing', path.join(sourceDir, 'ok.png')),
    ).toBe(null);
  });

  it('clears a track thumbnail while preserving the audio and metadata', () => {
    const track = importTrack();
    fs.writeFileSync(path.join(sourceDir, 'picked.webp'), 'image');
    writeTrackArtworkFile(dir, track.id, path.join(sourceDir, 'picked.webp'));

    expect(deleteTrackArtworkFile(dir, track.id)).toBe(true);

    expect(fs.existsSync(path.join(dir, 'tracks', track.id, 'audio.mp3'))).toBe(
      true,
    );
    expect(listTracks(dir)[0].thumbnailUrl).toBeUndefined();
    expect(loadIndex(dir).tracks[track.id]).toMatchObject({
      title: 'Local Song',
      sourceType: 'local-file',
      storageType: 'managed',
    });
  });

  it('returns false when there is no thumbnail to clear', () => {
    const track = importTrack();

    expect(deleteTrackArtworkFile(dir, track.id)).toBe(false);
  });
});

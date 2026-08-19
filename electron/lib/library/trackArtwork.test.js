import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  writeTrackArtworkFile,
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

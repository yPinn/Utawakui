import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearArtistPhoto,
  isArtistId,
  isArtistPhotoRemoved,
  listArtistPhotoUrls,
  promoteArtistPhotoState,
  readArtistPhoto,
  resolveArtistPhotoPath,
  writeArtistPhoto,
} from './artistPhotos.js';

const ARTIST_ID = 'artist-0123456789abcdef';
const STABLE_ARTIST_ID = 'artist-123e4567-e89b-42d3-a456-426614174000';
const CHANNEL_ID = 'UC5DHwv9N4OQ9AWtKr8YSefw';
const NOW = new Date('2026-10-05T12:00:00.000Z');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-artist-photos-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('artist photo storage', () => {
  it('accepts derived and stable artist ids only', () => {
    expect(isArtistId(ARTIST_ID)).toBe(true);
    expect(isArtistId(STABLE_ARTIST_ID)).toBe(true);
    expect(isArtistId('artist-../../x')).toBe(false);
    expect(isArtistId('3f2c9e0a-uuid')).toBe(false);
  });

  it('promotes the strongest legacy photo without deleting either source', () => {
    const automaticId = 'artist-1111111111111111';
    const localId = 'artist-2222222222222222';
    writeArtistPhoto(dir, automaticId, {
      buffer: Buffer.from('automatic'),
      extension: '.jpg',
      source: 'youtube-channel',
      channelId: CHANNEL_ID,
      now: new Date('2026-10-12T01:00:00.000Z'),
    });
    writeArtistPhoto(dir, localId, {
      buffer: Buffer.from('local'),
      extension: '.png',
      source: 'local-file',
      now: new Date('2026-10-11T01:00:00.000Z'),
    });

    expect(
      promoteArtistPhotoState(dir, [automaticId, localId], STABLE_ARTIST_ID),
    ).toEqual({
      changed: true,
      sourceArtistId: localId,
      state: 'photo',
    });
    expect(readArtistPhoto(dir, STABLE_ARTIST_ID)).toMatchObject({
      filename: 'photo.png',
      source: 'local-file',
    });
    expect(
      fs.readFileSync(
        path.join(dir, 'artists', STABLE_ARTIST_ID, 'photo.png'),
        'utf8',
      ),
    ).toBe('local');
    expect(readArtistPhoto(dir, automaticId)).not.toBeNull();
    expect(readArtistPhoto(dir, localId)).not.toBeNull();
  });

  it('promotes a removal marker only when no source has a photo', () => {
    const removedId = 'artist-3333333333333333';
    clearArtistPhoto(dir, removedId, {
      now: new Date('2026-10-12T02:00:00.000Z'),
    });

    expect(
      promoteArtistPhotoState(dir, [removedId], STABLE_ARTIST_ID),
    ).toMatchObject({ changed: true, state: 'removed' });
    expect(isArtistPhotoRemoved(dir, STABLE_ARTIST_ID)).toBe(true);
    expect(isArtistPhotoRemoved(dir, removedId)).toBe(true);
  });

  it('never overwrites an existing stable photo during promotion', () => {
    const sourceId = 'artist-4444444444444444';
    writeArtistPhoto(dir, sourceId, {
      buffer: Buffer.from('source'),
      extension: '.jpg',
      source: 'local-file',
      now: NOW,
    });
    writeArtistPhoto(dir, STABLE_ARTIST_ID, {
      buffer: Buffer.from('stable'),
      extension: '.webp',
      source: 'local-file',
      now: NOW,
    });

    expect(promoteArtistPhotoState(dir, [sourceId], STABLE_ARTIST_ID)).toEqual({
      changed: false,
      state: 'existing',
    });
    expect(
      fs.readFileSync(
        path.join(dir, 'artists', STABLE_ARTIST_ID, 'photo.webp'),
        'utf8',
      ),
    ).toBe('stable');
  });

  it('writes a YouTube photo with provenance and serves only that file', () => {
    const photo = writeArtistPhoto(dir, ARTIST_ID, {
      buffer: Buffer.from('jpeg'),
      extension: '.jpg',
      source: 'youtube-channel',
      channelId: CHANNEL_ID,
      now: NOW,
    });

    expect(photo).toEqual({
      filename: 'photo.jpg',
      source: 'youtube-channel',
      acceptedAt: NOW.toISOString(),
    });
    const provenance = JSON.parse(
      fs.readFileSync(
        path.join(dir, 'artists', ARTIST_ID, 'photo.json'),
        'utf8',
      ),
    );
    expect(provenance).toEqual({
      schemaVersion: 2,
      filename: 'photo.jpg',
      source: 'youtube-channel',
      channelId: CHANNEL_ID,
      acceptedAt: NOW.toISOString(),
    });
    expect(JSON.stringify(provenance)).not.toContain('http');
    expect(resolveArtistPhotoPath(dir, ARTIST_ID, 'photo.jpg')).toBe(
      path.join(dir, 'artists', ARTIST_ID, 'photo.jpg'),
    );
    expect(resolveArtistPhotoPath(dir, ARTIST_ID, 'photo.png')).toBe(null);
    expect(resolveArtistPhotoPath(dir, ARTIST_ID, 'photo.json')).toBe(null);
    expect(resolveArtistPhotoPath(dir, '../x', 'photo.jpg')).toBe(null);
  });

  it('replaces a previous photo of another type', () => {
    writeArtistPhoto(dir, ARTIST_ID, {
      buffer: Buffer.from('jpeg'),
      extension: '.jpg',
      source: 'youtube-channel',
      channelId: CHANNEL_ID,
      now: NOW,
    });
    writeArtistPhoto(dir, ARTIST_ID, {
      buffer: Buffer.from('png'),
      extension: '.png',
      source: 'local-file',
      now: NOW,
    });

    expect(fs.readdirSync(path.join(dir, 'artists', ARTIST_ID)).sort()).toEqual(
      ['photo.json', 'photo.png'],
    );
    expect(readArtistPhoto(dir, ARTIST_ID).source).toBe('local-file');
  });

  it('writes user-confirmed YouTube Music provenance without remote data', () => {
    const photo = writeArtistPhoto(dir, ARTIST_ID, {
      buffer: Buffer.from('webp'),
      extension: '.webp',
      source: 'youtube-music',
      selection: 'user-confirmed',
      now: NOW,
    });

    expect(photo).toEqual({
      filename: 'photo.webp',
      source: 'youtube-music',
      acceptedAt: NOW.toISOString(),
    });
    const provenance = JSON.parse(
      fs.readFileSync(
        path.join(dir, 'artists', ARTIST_ID, 'photo.json'),
        'utf8',
      ),
    );
    expect(provenance).toEqual({
      schemaVersion: 2,
      filename: 'photo.webp',
      source: 'youtube-music',
      selection: 'user-confirmed',
      acceptedAt: NOW.toISOString(),
    });
    expect(JSON.stringify(provenance)).not.toMatch(
      /https?:|browse|entity|private/i,
    );
  });

  it('continues reading valid v1 local and channel provenance', () => {
    const artistDir = path.join(dir, 'artists', ARTIST_ID);
    fs.mkdirSync(artistDir, { recursive: true });
    fs.writeFileSync(path.join(artistDir, 'photo.jpg'), 'legacy');
    fs.writeFileSync(
      path.join(artistDir, 'photo.json'),
      JSON.stringify({
        schemaVersion: 1,
        filename: 'photo.jpg',
        source: 'youtube-channel',
        channelId: CHANNEL_ID,
        acceptedAt: NOW.toISOString(),
      }),
    );

    expect(readArtistPhoto(dir, ARTIST_ID)).toEqual({
      filename: 'photo.jpg',
      source: 'youtube-channel',
      acceptedAt: NOW.toISOString(),
    });
  });

  it('rejects invalid writes before touching the filesystem', () => {
    expect(() =>
      writeArtistPhoto(dir, ARTIST_ID, {
        buffer: Buffer.from('x'),
        extension: '.gif',
        source: 'local-file',
      }),
    ).toThrow('invalid photo type');
    expect(() =>
      writeArtistPhoto(dir, ARTIST_ID, {
        buffer: Buffer.from('x'),
        extension: '.jpg',
        source: 'youtube-channel',
        channelId: 'not-a-channel',
      }),
    ).toThrow('invalid channel id');
    expect(() =>
      writeArtistPhoto(dir, ARTIST_ID, {
        buffer: Buffer.from('x'),
        extension: '.jpg',
        source: 'youtube-music',
      }),
    ).toThrow('invalid photo selection');
    expect(fs.existsSync(path.join(dir, 'artists'))).toBe(false);
  });

  it('lists versioned media URLs and ignores incomplete or foreign entries', () => {
    writeArtistPhoto(dir, ARTIST_ID, {
      buffer: Buffer.from('jpeg'),
      extension: '.jpg',
      source: 'local-file',
      now: NOW,
    });
    fs.mkdirSync(path.join(dir, 'artists', 'artist-ffffffffffffffff'));
    fs.mkdirSync(path.join(dir, 'artists', 'not-an-artist'));

    expect(listArtistPhotoUrls(dir)).toEqual(
      new Map([
        [
          ARTIST_ID,
          `utawakui-media://artist-photo/${ARTIST_ID}/photo.jpg?v=${NOW.getTime()}`,
        ],
      ]),
    );
  });

  it('treats a photo without matching provenance as absent and clears the directory', () => {
    writeArtistPhoto(dir, ARTIST_ID, {
      buffer: Buffer.from('jpeg'),
      extension: '.jpg',
      source: 'local-file',
      now: NOW,
    });
    fs.rmSync(path.join(dir, 'artists', ARTIST_ID, 'photo.jpg'));
    expect(readArtistPhoto(dir, ARTIST_ID)).toBe(null);

    expect(clearArtistPhoto(dir, ARTIST_ID, { now: NOW })).toBe(true);
    expect(fs.readdirSync(path.join(dir, 'artists', ARTIST_ID))).toEqual([
      'photo.json',
    ]);
    expect(readArtistPhoto(dir, ARTIST_ID)).toBe(null);
    expect(clearArtistPhoto(dir, '../escape')).toBe(false);
  });

  it('remembers a removal until a new photo is written', () => {
    expect(isArtistPhotoRemoved(dir, ARTIST_ID)).toBe(false);
    clearArtistPhoto(dir, ARTIST_ID, { now: NOW });
    expect(isArtistPhotoRemoved(dir, ARTIST_ID)).toBe(true);
    expect(listArtistPhotoUrls(dir).size).toBe(0);

    writeArtistPhoto(dir, ARTIST_ID, {
      buffer: Buffer.from('png'),
      extension: '.png',
      source: 'local-file',
      now: NOW,
    });
    expect(isArtistPhotoRemoved(dir, ARTIST_ID)).toBe(false);
    const provenance = JSON.parse(
      fs.readFileSync(
        path.join(dir, 'artists', ARTIST_ID, 'photo.json'),
        'utf8',
      ),
    );
    expect(provenance.schemaVersion).toBe(2);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearArtistPhoto,
  isArtistId,
  isArtistPhotoRemoved,
  listArtistPhotoUrls,
  readArtistPhoto,
  resolveArtistPhotoPath,
  writeArtistPhoto,
} from './artistPhotos.js';

const ARTIST_ID = 'artist-0123456789abcdef';
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
  it('accepts only derived artist ids', () => {
    expect(isArtistId(ARTIST_ID)).toBe(true);
    expect(isArtistId('artist-../../x')).toBe(false);
    expect(isArtistId('3f2c9e0a-uuid')).toBe(false);
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
      schemaVersion: 1,
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
  });
});

import { describe, it, expect } from 'vitest';
import { extractMetadataFields } from './ytdlpInfo.js';

describe('extractMetadataFields', () => {
  it('extracts a full YT Music info object', () => {
    expect(
      extractMetadataFields({
        title: '夜に駆ける',
        artist: 'YOASOBI',
        uploader: 'YOASOBI Official Channel',
        duration: 261,
      }),
    ).toEqual({ title: '夜に駆ける', artist: 'YOASOBI', duration: 261 });
  });

  it('falls back to uploader for artist on a plain YouTube upload', () => {
    expect(
      extractMetadataFields({
        title: 'Some Video',
        uploader: 'Some Channel',
        duration: 120.5,
      }),
    ).toEqual({ title: 'Some Video', artist: 'Some Channel', duration: 120.5 });
  });

  it('leaves artist undefined when neither artist nor uploader is present', () => {
    expect(extractMetadataFields({ title: 'Untitled', duration: 10 })).toEqual({
      title: 'Untitled',
      artist: undefined,
      duration: 10,
    });
  });

  it('leaves everything undefined for an empty info object', () => {
    expect(extractMetadataFields({})).toEqual({
      title: undefined,
      artist: undefined,
      duration: undefined,
    });
  });

  it('ignores wrong-typed fields instead of coercing them', () => {
    expect(
      extractMetadataFields({ title: 123, artist: null, duration: '261' }),
    ).toEqual({ title: undefined, artist: undefined, duration: undefined });
  });

  it('extracts a direct HTTPS thumbnail URL for preview-only rendering', () => {
    expect(
      extractMetadataFields({
        title: 'Preview Song',
        thumbnail: 'https://i.ytimg.com/vi/id/hqdefault.jpg',
      }).thumbnailUrl,
    ).toBe('https://i.ytimg.com/vi/id/hqdefault.jpg');
  });

  it('uses the largest thumbnail array entry when no direct thumbnail exists', () => {
    expect(
      extractMetadataFields({
        thumbnails: [
          { url: 'https://i.ytimg.com/vi/id/default.jpg' },
          { url: 'https://i.ytimg.com/vi/id/maxresdefault.jpg' },
        ],
      }).thumbnailUrl,
    ).toBe('https://i.ytimg.com/vi/id/maxresdefault.jpg');
  });

  it('falls back to the standard YouTube thumbnail URL for video ids', () => {
    expect(
      extractMetadataFields({
        id: '0D28qd--kRE',
      }).thumbnailUrl,
    ).toBe('https://i.ytimg.com/vi/0D28qd--kRE/hqdefault.jpg');
  });

  it('ignores non-HTTPS thumbnail URLs', () => {
    expect(
      extractMetadataFields({
        thumbnail: 'file:///C:/secret.jpg',
        thumbnails: [{ url: 'http://example.test/insecure.jpg' }],
      }).thumbnailUrl,
    ).toBeUndefined();
  });

  it('extracts album and releaseYear for a recognized-music source', () => {
    const fields = extractMetadataFields({
      title: 'Track Name',
      artist: 'Some Artist',
      album: 'Some Album',
      release_year: 2018,
    });
    expect(fields.album).toBe('Some Album');
    expect(fields.releaseYear).toBe(2018);
  });

  it('omits album and releaseYear rather than defaulting when absent', () => {
    const fields = extractMetadataFields({
      title: 'Plain Upload',
      uploader: 'Some Channel',
    });
    expect(fields.album).toBeUndefined();
    expect(fields.releaseYear).toBeUndefined();
  });

  it('ignores wrong-typed album/release_year instead of coercing them', () => {
    const fields = extractMetadataFields({
      title: 'Track Name',
      album: 123,
      release_year: '2018',
    });
    expect(fields.album).toBeUndefined();
    expect(fields.releaseYear).toBeUndefined();
  });
});

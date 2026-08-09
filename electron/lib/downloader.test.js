import { describe, it, expect } from 'vitest';
import { extractMetadataFields } from './downloader.js';

// downloadAudio/fetchMetadata themselves call the real yt-dlp/YouTube —
// deliberately not covered here (slow, network-dependent, not suitable for
// CI). extractMetadataFields is the pure field-extraction logic they share.
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
});

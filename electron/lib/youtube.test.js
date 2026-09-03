import { describe, it, expect } from 'vitest';
import {
  extractVideoId,
  extractPlaylistId,
  classifyPlaylistKind,
} from './youtube.js';

describe('extractVideoId', () => {
  it('accepts a bare 11-char id', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('accepts a regular youtube.com watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('accepts a youtu.be short link', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('accepts a music.youtube.com watch URL', () => {
    expect(
      extractVideoId('https://music.youtube.com/watch?v=h56D4YPnEqc'),
    ).toBe('h56D4YPnEqc');
  });

  it('accepts a music.youtube.com URL with extra radio-context params', () => {
    expect(
      extractVideoId(
        'https://music.youtube.com/watch?v=h56D4YPnEqc&list=RDAMVMxxx',
      ),
    ).toBe('h56D4YPnEqc');
  });

  it('rejects an unrelated host', () => {
    expect(extractVideoId('https://evil.com/watch?v=dQw4w9WgXcQ')).toBe(null);
  });

  it('rejects garbage input', () => {
    expect(extractVideoId('not a url')).toBe(null);
  });
});

describe('extractPlaylistId', () => {
  it('accepts a bare playlist URL', () => {
    expect(
      extractPlaylistId('https://www.youtube.com/playlist?list=PLxxxxxxxx'),
    ).toBe('PLxxxxxxxx');
  });

  it('accepts a watch URL that also carries playlist context', () => {
    expect(
      extractPlaylistId(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxxxxxx',
      ),
    ).toBe('PLxxxxxxxx');
  });

  it('accepts a music.youtube.com playlist URL', () => {
    expect(
      extractPlaylistId('https://music.youtube.com/playlist?list=OLAK5uy_x'),
    ).toBe('OLAK5uy_x');
  });

  it('accepts a youtu.be URL with a list param', () => {
    expect(
      extractPlaylistId('https://youtu.be/dQw4w9WgXcQ?list=PLxxxxxxxx'),
    ).toBe('PLxxxxxxxx');
  });

  it('returns null for a URL with no list param — not an error, just not a playlist', () => {
    expect(
      extractPlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe(null);
  });

  it('returns null for an unrelated host even with a list param', () => {
    expect(extractPlaylistId('https://evil.com/?list=PLxxxxxxxx')).toBe(null);
  });

  it('returns null for garbage input', () => {
    expect(extractPlaylistId('not a url')).toBe(null);
  });

  it.each([
    'https://youtube.com/playlist?list=PLsafe%26index%3D99',
    `https://youtube.com/playlist?list=${'x'.repeat(129)}`,
  ])('rejects a playlist id that cannot be safely embedded: %s', (input) => {
    expect(extractPlaylistId(input)).toBe(null);
  });

  // RD-prefixed lists are YouTube's auto-generated Radio/Mix — personalized,
  // open-ended, not a fixed saved playlist. yt-dlp's flat-playlist mode
  // can't list them ("YouTube said: This playlist type is unviewable.",
  // confirmed against a real URL of this shape) — treated as "not a
  // playlist" so it falls through to the single-video download path
  // instead of surfacing that error to the user.
  it('returns null for a watch URL carrying an RD radio/mix context', () => {
    expect(
      extractPlaylistId(
        'https://www.youtube.com/watch?v=oIcAZw3-uI8&list=RDoIcAZw3-uI8&start_radio=1',
      ),
    ).toBe(null);
  });
});

describe('classifyPlaylistKind', () => {
  it('classifies an OLAK5uy_-prefixed id as an album', () => {
    expect(classifyPlaylistKind('OLAK5uy_x')).toBe('album');
  });

  it('classifies a PL-prefixed id as an ordinary playlist', () => {
    expect(classifyPlaylistKind('PLxxxxxxxx')).toBe('playlist');
  });

  it('classifies non-string input as a playlist rather than throwing', () => {
    expect(classifyPlaylistKind(undefined)).toBe('playlist');
    expect(classifyPlaylistKind(null)).toBe('playlist');
  });
});

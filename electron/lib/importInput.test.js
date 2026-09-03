import { describe, expect, it } from 'vitest';
import importInputModule from './importInput.js';

const { classifyImportInput } = importInputModule;

describe('classifyImportInput', () => {
  it.each([
    ['周杰倫 晴天', { kind: 'text-query', query: '周杰倫 晴天' }],
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { kind: 'youtube-video', videoId: 'dQw4w9WgXcQ' },
    ],
    [
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      { kind: 'youtube-music-video', videoId: 'dQw4w9WgXcQ' },
    ],
    [
      'https://www.youtube.com/playlist?list=PL1234567890',
      { kind: 'youtube-playlist', playlistId: 'PL1234567890' },
    ],
    [
      'https://music.youtube.com/playlist?list=OLAK5uy_example',
      { kind: 'youtube-music-album', playlistId: 'OLAK5uy_example' },
    ],
  ])('classifies supported input %s', (input, expected) => {
    expect(classifyImportInput(input)).toMatchObject(expected);
  });

  it.each([
    ['https://open.spotify.com/track/123', 'spotify'],
    ['https://music.apple.com/tw/album/example/123?i=456', 'apple-music'],
  ])(
    'recognizes deferred provider URLs without fetching them',
    (input, platform) => {
      expect(classifyImportInput(input)).toEqual({
        kind: 'deferred-provider-url',
        platform,
        input,
      });
    },
  );

  it('rejects unsupported URLs instead of turning them into search text', () => {
    expect(classifyImportInput('https://example.com/song?q=test')).toEqual({
      kind: 'unsupported-url',
      input: 'https://example.com/song?q=test',
    });
  });

  it('normalizes control characters and bounds free-text queries', () => {
    expect(classifyImportInput('  Artist\nSong\u0000  ')).toMatchObject({
      kind: 'text-query',
      query: 'Artist Song',
    });
    expect(classifyImportInput('x'.repeat(201))).toMatchObject({
      kind: 'invalid',
      reason: 'query-too-long',
    });
  });

  it('keeps colon-bearing song names as text instead of treating them as URL schemes', () => {
    expect(classifyImportInput('Artist: Song Title')).toMatchObject({
      kind: 'text-query',
      query: 'Artist: Song Title',
    });
  });
});

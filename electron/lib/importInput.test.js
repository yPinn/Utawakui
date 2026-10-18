import { describe, expect, it } from 'vitest';
import importInputModule from './importInput.js';

const { classifyImportInput, parseImportSourceUrl } = importInputModule;

describe('shared import source URL parser', () => {
  it.each([
    [
      ' https://youtu.be/dQw4w9WgXcQ?si=private&utm_source=share&t=30#personal ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ],
    [
      'http://M.YouTube.com/shorts/dQw4w9WgXcQ?feature=share&new_tracking=value',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ],
    [
      'https://www.music.youtube.com/watch?v=dQw4w9WgXcQ&pp=personal&index=4',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890&index=4&si=private',
      'https://www.youtube.com/playlist?list=PL1234567890',
    ],
    [
      'https://music.youtube.com/playlist?list=OLAK5uy_example&si=private',
      'https://music.youtube.com/playlist?list=OLAK5uy_example',
    ],
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ],
  ])(
    'normalizes manual and clipboard input identically: %s',
    (raw, canonical) => {
      const clipboard = parseImportSourceUrl(raw);
      expect(clipboard.input).toBe(canonical);
      expect(classifyImportInput(raw)).toEqual(clipboard);
      expect(parseImportSourceUrl(canonical)).toEqual(clipboard);
      expect(classifyImportInput(canonical)).toEqual(clipboard);
    },
  );

  it.each([
    'file://youtube.com/watch?v=dQw4w9WgXcQ',
    'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://user:secret@youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ\nhttps://example.com',
    'https://you\ttube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=' + 'x'.repeat(2048),
  ])('rejects unsafe or malformed links for both entrances: %s', (raw) => {
    expect(parseImportSourceUrl(raw)).toBeNull();
    expect(['unsupported-url', 'invalid']).toContain(
      classifyImportInput(raw).kind,
    );
  });

  it('keeps keyword and bare video ID support out of clipboard suggestions', () => {
    expect(parseImportSourceUrl('Artist Song')).toBeNull();
    expect(parseImportSourceUrl('dQw4w9WgXcQ')).toBeNull();
    expect(parseImportSourceUrl(null)).toBeNull();
    expect(classifyImportInput('dQw4w9WgXcQ')).toEqual({
      kind: 'youtube-video',
      input: 'dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });
  });
});

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

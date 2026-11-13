import { expect, it } from 'vitest';
import { extractVideoId, normalizeVideoInput } from './youtubeVideoId.mjs';

it.each([
  'https://www.youtube.com/watch?v=ARj1adoUoEU&list=PL123&index=8&utm_source=share#t=90',
  'https://youtu.be/ARj1adoUoEU?si=share&t=10',
  'https://music.youtube.com/watch?list=RD123&v=ARj1adoUoEU&feature=share',
  'http://m.youtube.com/shorts/ARj1adoUoEU?utm_medium=link',
])(
  'normalizes a video link to its identity without playback or tracking suffixes',
  (url) => {
    const normalized = normalizeVideoInput(url);
    expect(normalized).toBe('https://www.youtube.com/watch?v=ARj1adoUoEU');
    expect(extractVideoId(normalized)).toBe(extractVideoId(url));
  },
);

it('retains bare IDs and leaves incomplete or unrelated input available for correction', () => {
  expect(normalizeVideoInput(' LVCwdZoUFQ8 ')).toBe('LVCwdZoUFQ8');
  expect(normalizeVideoInput('https://www.youtube.com/watch?v=LVC')).toBe(
    'https://www.youtube.com/watch?v=LVC',
  );
  expect(normalizeVideoInput('https://example.com/watch?v=LVCwdZoUFQ8')).toBe(
    'https://example.com/watch?v=LVCwdZoUFQ8',
  );
});

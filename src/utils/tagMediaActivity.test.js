import { it, expect } from 'vitest';
import { tagMediaActivity } from './tagMediaActivity.js';
it('blocks the authoritative active player, BGM and preview without blocking a paused queue', () => {
  expect(
    tagMediaActivity({
      player: { isPlaying: true, track: { id: 'one' } },
      bgm: { isPlaying: true },
      bgmTrackIds: ['two', 'old'],
      preview: { isOpen: true, index: 0, tracks: [{ id: 'one' }] },
    }),
  ).toEqual(['one', 'two', 'old']);
  expect(
    tagMediaActivity({
      player: {
        isPlaying: false,
        playbackPhase: 'paused',
        track: { id: 'one' },
      },
    }),
  ).toEqual([]);
  expect(
    tagMediaActivity({
      player: { playbackPhase: 'loading', track: { id: 'loading' } },
    }),
  ).toEqual(['loading']);
  expect(
    tagMediaActivity({
      player: { pendingStartTrackId: 'pending' },
      bgm: { playIntentActive: true },
      bgmTrackIds: ['bgm-pending'],
    }),
  ).toEqual(['pending', 'bgm-pending']);
});

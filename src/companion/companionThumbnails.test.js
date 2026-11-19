import { describe, expect, it } from 'vitest';
import { createCompanionThumbnails } from './companionThumbnails.js';

function setup({ live = true, pinned = () => false } = {}) {
  const calls = [];
  const state = { live };
  const revoked = [];
  const thumbnails = createCompanionThumbnails({
    getArtwork: (id, signal) =>
      new Promise((resolve) => calls.push({ id, signal, resolve })),
    isLive: () => state.live,
    isPinned: pinned,
    createUrl: (blob) => `blob:${blob}`,
    revokeUrl: (url) => revoked.push(url),
  });
  return { thumbnails, calls, state, revoked };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('companion thumbnails', () => {
  it('loads two at a time and lets on-screen rows jump the background queue', async () => {
    const { thumbnails, calls } = setup();
    thumbnails.preload(['a', 'b', 'c', 'd']);
    expect(calls.map(({ id }) => id)).toEqual(['a', 'b']);
    thumbnails.request('d', { urgent: true });
    calls[0].resolve('A');
    await settle();
    expect(calls.map(({ id }) => id)).toEqual(['a', 'b', 'd']);
    expect(thumbnails.withThumbnail({ id: 'a' }).thumbnailUrl).toBe('blob:A');
  });

  it('skips loaded or in-flight tracks and keeps the fallback for missing art', async () => {
    const { thumbnails, calls } = setup();
    thumbnails.request('a');
    thumbnails.request('a');
    expect(calls).toHaveLength(1);
    calls[0].resolve(null);
    await settle();
    thumbnails.request('a');
    expect(calls).toHaveLength(1);
    expect(thumbnails.withThumbnail({ id: 'a' })).toEqual({ id: 'a' });
  });

  it('stops while offline and keeps cached art for the reconnect', async () => {
    const { thumbnails, calls, state } = setup();
    thumbnails.preload(['a', 'b', 'c']);
    calls[0].resolve('A');
    await settle();
    state.live = false;
    thumbnails.pause();
    expect(calls[1].signal.aborted).toBe(true);
    thumbnails.request('d');
    expect(calls.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(thumbnails.withThumbnail({ id: 'a' }).thumbnailUrl).toBe('blob:A');
  });

  it('evicts the oldest unpinned art past the cache bound', async () => {
    const { thumbnails, calls, revoked } = setup({
      pinned: (id) => id === 't0',
    });
    for (let index = 0; index < 151; index += 1) {
      thumbnails.request(`t${index}`);
      calls.at(-1).resolve(`T${index}`);
      await settle();
    }
    expect(revoked).toEqual(['blob:T1']);
    expect(thumbnails.withThumbnail({ id: 't0' }).thumbnailUrl).toBe('blob:T0');
    thumbnails.dispose();
    expect(revoked).toHaveLength(151);
  });
});

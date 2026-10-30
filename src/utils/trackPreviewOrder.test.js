import { describe, expect, it } from 'vitest';

import {
  orderPreviewTracks,
  shufflePreviewTracks,
} from './trackPreviewOrder.js';

const tracks = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const ids = (list) => list.map((track) => track.id);

describe('shufflePreviewTracks', () => {
  it('reorders every track when nothing is selected', () => {
    // random() = 0 swaps each slot with the first: a b c d -> b c d a.
    const shuffled = shufflePreviewTracks(tracks, { random: () => 0 });

    expect(ids(shuffled)).toEqual(['b', 'c', 'd', 'a']);
    expect(ids(tracks)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the selected track first and shuffles the rest', () => {
    const shuffled = shufflePreviewTracks(tracks, {
      pinnedId: 'c',
      random: () => 0,
    });

    expect(ids(shuffled)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('ignores a selection outside the list', () => {
    const shuffled = shufflePreviewTracks(tracks, {
      pinnedId: 'missing',
      random: () => 0.999,
    });

    expect(ids(shuffled).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('orderPreviewTracks', () => {
  it.each(['artist', 'all'])('shuffles derived %s views', (mode) => {
    const ordered = orderPreviewTracks(tracks, {
      mode,
      pinnedId: 'c',
      random: () => 0,
    });

    expect(ids(ordered)).toEqual(['c', 'b', 'd', 'a']);
  });

  it.each(['album', 'playlist'])('keeps authored %s order', (mode) => {
    const ordered = orderPreviewTracks(tracks, {
      mode,
      pinnedId: 'c',
      random: () => 0,
    });

    expect(ordered).toBe(tracks);
  });
});

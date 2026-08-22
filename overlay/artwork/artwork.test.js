import { describe, expect, it, vi } from 'vitest';
import { renderArtworkFrame } from './artwork.mjs';

function elements() {
  return {
    root: { hidden: true, dataset: {} },
    image: {
      hidden: true,
      dataset: {},
      removeAttribute: vi.fn(),
      src: '',
      onload: null,
      onerror: null,
    },
    fallback: { hidden: false, textContent: '' },
    title: { textContent: '' },
    artist: { textContent: '' },
  };
}

describe('artwork overlay rendering', () => {
  it('keeps the initial fallback until a validated image loads', () => {
    const view = elements();
    renderArtworkFrame(view, {
      revision: 3,
      visible: true,
      trackId: 'track / one',
      title: 'Stellar Stellar',
      artist: '星街すいせい',
    });

    expect(view.image.src).toBe('/media/artwork/track%20%2F%20one');
    expect(view.image.hidden).toBe(true);
    expect(view.fallback).toMatchObject({ hidden: false, textContent: 'S' });

    view.image.onload();
    expect(view.image.hidden).toBe(false);
    expect(view.fallback.hidden).toBe(true);
  });

  it('restores the fallback when artwork decoding fails', () => {
    const view = elements();
    renderArtworkFrame(view, {
      revision: 4,
      visible: true,
      trackId: 'track-2',
      title: '夜に駆ける',
      artist: 'YOASOBI',
    });

    view.image.onload();
    view.image.onerror();
    expect(view.image.hidden).toBe(true);
    expect(view.fallback).toMatchObject({ hidden: false, textContent: '夜' });
  });
});

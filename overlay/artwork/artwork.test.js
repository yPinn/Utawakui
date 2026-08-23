import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderArtworkFrame } from './artwork.mjs';

function elements() {
  return {
    root: {
      hidden: true,
      dataset: {},
      style: { setProperty: vi.fn() },
    },
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
    elapsed: { textContent: '' },
    remaining: { textContent: '' },
  };
}

describe('artwork overlay rendering', () => {
  it('keeps unsupported volume chrome out of the capture-only player', () => {
    const html = fs.readFileSync(
      new URL('./index.html', import.meta.url),
      'utf8',
    );

    expect(html).toContain('class="artwork-overlay__timeline"');
    expect(html).toContain('class="artwork-overlay__transport"');
    expect(html).not.toContain('artwork-overlay__volume');
  });

  it('keeps the initial fallback until a validated image loads', () => {
    const view = elements();
    renderArtworkFrame(view, {
      revision: 3,
      visible: true,
      trackId: 'track / one',
      title: 'Stellar Stellar',
      artist: '星街すいせい',
      playbackStatus: 'playing',
      positionMs: 65000,
      durationMs: 185000,
      progress: 65 / 185,
    });

    expect(view.image.src).toBe('/media/artwork/track%20%2F%20one');
    expect(view.image.hidden).toBe(true);
    expect(view.fallback).toMatchObject({ hidden: false, textContent: 'S' });
    expect(view.root.dataset.playbackStatus).toBe('playing');
    expect(view.root.style.setProperty).toHaveBeenCalledWith(
      '--ovl-artwork-progress',
      `${(65 / 185) * 100}%`,
    );
    expect(view.elapsed.textContent).toBe('1:05');
    expect(view.remaining.textContent).toBe('-2:00');

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
      playbackStatus: 'paused',
      positionMs: 0,
      durationMs: 0,
      progress: 0,
    });

    view.image.onload();
    view.image.onerror();
    expect(view.image.hidden).toBe(true);
    expect(view.fallback).toMatchObject({ hidden: false, textContent: '夜' });
  });

  it('clamps invalid playback values to a stable zero-duration fallback', () => {
    const view = elements();
    renderArtworkFrame(view, {
      revision: 5,
      visible: true,
      trackId: '',
      title: 'Fallback',
      artist: '',
      playbackStatus: 'idle',
      positionMs: Number.NaN,
      durationMs: Number.NaN,
      progress: Number.POSITIVE_INFINITY,
    });

    expect(view.root.style.setProperty).toHaveBeenCalledWith(
      '--ovl-artwork-progress',
      '0%',
    );
    expect(view.elapsed.textContent).toBe('0:00');
    expect(view.remaining.textContent).toBe('-0:00');
    expect(view.image.removeAttribute).toHaveBeenCalledWith('src');
    expect(view.fallback.hidden).toBe(false);
  });
});

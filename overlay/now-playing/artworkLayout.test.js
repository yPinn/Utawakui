import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearArtworkSleeve,
  preloadArtworkSource,
  prepareArtworkSleeve,
  renderArtworkFrame,
} from './artworkLayout.mjs';

afterEach(() => vi.unstubAllGlobals());

function elements(presentationCache) {
  return {
    root: {
      hidden: true,
      dataset: {},
      style: { setProperty: vi.fn(), removeProperty: vi.fn() },
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
    presentationCache,
  };
}

function sleeveElements(presentationCache) {
  const view = elements(presentationCache);
  return {
    root: view.root,
    image: view.image,
    fallback: view.fallback,
    title: view.title,
    artist: view.artist,
    presentationCache,
  };
}

describe('Now Playing artwork layouts', () => {
  it('warms the next allowlisted artwork before a sleeve exchange', () => {
    class PreviewImage {
      src = '';
    }

    const image = preloadArtworkSource('track / one', PreviewImage);

    expect(image).toBeInstanceOf(PreviewImage);
    expect(image.src).toBe('/media/artwork/track%20%2F%20one');
    expect(preloadArtworkSource('', PreviewImage)).toBeNull();
  });

  it('prepares B in a hidden independent sleeve and clears it after takeover', () => {
    const sleeve = sleeveElements();
    prepareArtworkSleeve(sleeve, {
      trackId: 'track-b',
      title: 'Song B',
      artist: 'Singer B',
    });

    expect(sleeve.root.hidden).toBe(true);
    expect(sleeve.image.src).toBe('/media/artwork/track-b');
    expect(sleeve.fallback).toMatchObject({
      hidden: false,
      textContent: 'S',
    });
    expect(sleeve.title.textContent).toBe('Song B');
    expect(sleeve.artist.textContent).toBe('Singer B');

    clearArtworkSleeve(sleeve);

    expect(sleeve.root.hidden).toBe(true);
    expect(sleeve.image.removeAttribute).toHaveBeenCalledWith('src');
    expect(sleeve.title.textContent).toBe('');
    expect(sleeve.artist.textContent).toBe('');
  });

  it('keeps the fallback until a validated image loads', () => {
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
    expect(view.root.style.removeProperty).toHaveBeenCalledWith(
      '--ovl-color-artwork-accent',
    );
    expect(view.root.style.removeProperty).toHaveBeenCalledWith(
      '--ovl-color-artwork-label',
    );
    expect(view.root.dataset.artworkCopyTone).toBe('light');
    expect(view.root.dataset.playbackStatus).toBe('playing');
    expect(view.root.style.setProperty).toHaveBeenCalledWith(
      '--ovl-artwork-progress',
      `${(65 / 185) * 100}%`,
    );
    expect(view.root.style.setProperty).toHaveBeenCalledWith(
      '--ovl-artwork-progress-scale',
      65 / 185,
    );
    expect(view.elapsed.textContent).toBe('1:05');
    expect(view.remaining.textContent).toBe('-2:00');

    view.image.onload();
    expect(view.image.hidden).toBe(false);
    expect(view.fallback.hidden).toBe(true);
  });

  it('renders a stable fallback for invalid media and timing', () => {
    const view = elements();
    renderArtworkFrame(view, {
      revision: 4,
      visible: true,
      trackId: '',
      title: '夜に駆ける',
      artist: 'YOASOBI',
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
    expect(view.fallback).toMatchObject({ hidden: false, textContent: '夜' });
  });

  it('switches a white album to dark ink while keeping neutral vinyl colors', () => {
    const view = elements();
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray(
        Array.from({ length: 24 * 24 }, () => [246, 244, 239, 255]).flat(),
      ),
    }));
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData })),
      })),
    });

    renderArtworkFrame(view, {
      revision: 5,
      visible: true,
      trackId: 'white-album',
      title: 'Kawakiwoameku',
      artist: 'minami',
      playbackStatus: 'playing',
      positionMs: 0,
      durationMs: 1000,
      progress: 0,
    });
    view.image.onload();

    expect(view.root.dataset.artworkCopyTone).toBe('dark');
    expect(view.root.style.setProperty).not.toHaveBeenCalledWith(
      '--ovl-color-artwork-accent',
      expect.anything(),
    );
    expect(view.root.style.setProperty).not.toHaveBeenCalledWith(
      '--ovl-color-artwork-label',
      expect.anything(),
    );
  });

  it('reuses a prepared three-color presentation before the new record emerges', () => {
    const presentationCache = new Map();
    const incoming = sleeveElements(presentationCache);
    const view = elements(presentationCache);
    const sampledPixels = [
      ...Array.from({ length: 192 }, () => [220, 58, 52, 255]),
      ...Array.from({ length: 192 }, () => [38, 154, 102, 255]),
      ...Array.from({ length: 192 }, () => [46, 88, 218, 255]),
    ].flat();
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray(sampledPixels),
    }));
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData })),
      })),
    });

    prepareArtworkSleeve(incoming, {
      trackId: 'tri-color-album',
      title: 'Prepared',
      artist: 'Artist',
    });
    incoming.image.onload();

    renderArtworkFrame(view, {
      revision: 7,
      visible: true,
      trackId: 'tri-color-album',
      title: 'Prepared',
      artist: 'Artist',
      playbackStatus: 'paused',
      positionMs: 0,
      durationMs: 1000,
      progress: 0,
    });

    for (const property of [
      '--ovl-color-artwork-accent',
      '--ovl-color-artwork-secondary',
      '--ovl-color-artwork-tertiary',
    ]) {
      expect(view.root.style.setProperty).toHaveBeenCalledWith(
        property,
        expect.stringMatching(/^rgb\(/),
      );
    }
    expect(view.root.style.setProperty).toHaveBeenCalledWith(
      '--ovl-template-artwork-record-shadow-mask',
      expect.stringContaining('data:image/svg+xml'),
    );
    expect(view.root.style.setProperty).toHaveBeenCalledWith(
      '--ovl-template-artwork-record-highlight-mask',
      expect.stringContaining('data:image/svg+xml'),
    );
    expect(view.root.style.setProperty).toHaveBeenCalledWith(
      '--ovl-template-artwork-record-ink',
      expect.stringContaining('radial-gradient('),
    );
    expect(getImageData).toHaveBeenCalledOnce();
  });

  it('keeps a chromatic album accent synchronized across vinyl and label', () => {
    const view = elements();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({
            data: new Uint8ClampedArray(
              Array.from({ length: 24 * 24 }, () => [40, 130, 190, 255]).flat(),
            ),
          })),
        })),
      })),
    });

    renderArtworkFrame(view, {
      revision: 6,
      visible: true,
      trackId: 'blue-album',
      title: 'Blue',
      artist: 'Artist',
      playbackStatus: 'paused',
      positionMs: 0,
      durationMs: 1000,
      progress: 0,
    });
    view.image.onload();

    const accentCall = view.root.style.setProperty.mock.calls.find(
      ([property]) => property === '--ovl-color-artwork-accent',
    );
    expect(accentCall?.[1]).toMatch(/^rgb\(/);
    expect(view.root.style.setProperty).toHaveBeenCalledWith(
      '--ovl-color-artwork-label',
      accentCall[1],
    );
  });
});

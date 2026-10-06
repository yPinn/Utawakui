import { describe, expect, it, vi } from 'vitest';

import { loadArtworkTone, toneFromPixels } from './artworkTone.js';

function pixels(...colors) {
  return Uint8ClampedArray.from(
    colors.flatMap(([r, g, b, a = 255]) => [r, g, b, a]),
  );
}

describe('toneFromPixels', () => {
  it('lets saturated mid-tones outweigh white borders and black bars', () => {
    const tone = toneFromPixels(
      pixels([255, 255, 255], [0, 0, 0], [0, 0, 0], [20, 120, 60]),
    );
    const [r, g, b] = tone.match(/\d+/gu).map(Number);

    // Dominated by the green, not pulled to grey by the neutrals.
    expect(g).toBeGreaterThan(r + 40);
    expect(g).toBeGreaterThan(b + 20);
  });

  it('ignores transparent pixels and has no tone for an empty image', () => {
    expect(toneFromPixels(pixels([255, 0, 0, 0]))).toBeNull();
    expect(toneFromPixels(pixels([200, 40, 40], [0, 0, 255, 0]))).toBe(
      'rgb(200 40 40)',
    );
  });
});

describe('loadArtworkTone', () => {
  function fakeImage({ fail = false } = {}) {
    const image = {};
    Object.defineProperty(image, 'src', {
      set() {
        queueMicrotask(() => (fail ? image.onerror() : image.onload()));
      },
    });
    return image;
  }

  function fakeCanvas(data) {
    return () => ({
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data }),
      }),
    });
  }

  it('samples a cover once and reuses the cached tone', async () => {
    const createImage = vi.fn(() => fakeImage());
    const createCanvas = fakeCanvas(pixels([30, 90, 200]));

    const first = await loadArtworkTone('utawakui-media://cover/a', {
      createImage,
      createCanvas,
    });
    const second = await loadArtworkTone('utawakui-media://cover/a', {
      createImage,
      createCanvas,
    });

    expect(first).toBe('rgb(30 90 200)');
    expect(second).toBe(first);
    expect(createImage).toHaveBeenCalledOnce();
  });

  it('has no tone without a cover, on a load error or a tainted canvas', async () => {
    expect(await loadArtworkTone('')).toBeNull();
    expect(
      await loadArtworkTone('utawakui-media://cover/missing', {
        createImage: () => fakeImage({ fail: true }),
      }),
    ).toBeNull();
    expect(
      await loadArtworkTone('utawakui-media://cover/tainted', {
        createImage: () => fakeImage(),
        createCanvas: () => ({
          getContext: () => ({
            drawImage: vi.fn(),
            getImageData: () => {
              throw new Error('SecurityError');
            },
          }),
        }),
      }),
    ).toBeNull();
  });
});

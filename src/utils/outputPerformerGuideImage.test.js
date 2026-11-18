import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  performerGuideImageBounds,
  preparePerformerGuideImage,
  trimPerformerGuideImage,
} from './outputPerformerGuideImage.js';

function imageData(width, height, visible) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of visible) data[(y * width + x) * 4 + 3] = 255;
  return { width, height, data };
}

afterEach(() => vi.unstubAllGlobals());

describe('placement image transparency', () => {
  it('trims only transparent outer rows and columns, retaining internal gaps', () => {
    const pixels = imageData(8, 9, [
      [2, 3],
      [5, 6],
      [4, 2],
    ]);
    expect(performerGuideImageBounds(pixels)).toEqual({
      left: 2,
      top: 2,
      width: 4,
      height: 5,
    });
  });

  it('keeps opaque backgrounds and rejects fully transparent images', () => {
    const opaque = imageData(3, 2, []);
    opaque.data.fill(255);
    expect(performerGuideImageBounds(opaque)).toEqual({
      left: 0,
      top: 0,
      width: 3,
      height: 2,
    });
    expect(performerGuideImageBounds(imageData(3, 2, []))).toBeNull();
  });

  it('encodes the trimmed canvas dimensions from the visible image bounds', async () => {
    const png = new Blob(['encoded'], { type: 'image/png' });
    const sampleContext = {
      drawImage: vi.fn(),
      getImageData: () =>
        imageData(8, 9, [
          [2, 3],
          [5, 6],
        ]),
    };
    const sample = { getContext: () => sampleContext };
    const drawCrop = vi.fn();
    const output = {
      getContext: () => ({ drawImage: drawCrop }),
      toBlob: vi.fn((callback) => callback(png)),
    };
    const createElement = vi
      .fn()
      .mockReturnValueOnce(sample)
      .mockReturnValueOnce(output);
    vi.stubGlobal('document', { createElement });
    const source = {};

    expect(await trimPerformerGuideImage(source, 8, 9)).toBe(png);
    expect(sampleContext.drawImage).toHaveBeenCalledWith(source, 0, 0, 8, 9);
    expect(output).toMatchObject({ width: 4, height: 4 });
    expect(drawCrop).toHaveBeenCalledWith(sample, -2, -3);
    expect(output.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/png',
    );
  });

  it('rejects unsupported or oversized files before decoding', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    expect(
      await preparePerformerGuideImage(
        new File(['sample'], 'photo.svg', { type: 'image/svg+xml' }),
      ),
    ).toBeNull();
    expect(
      await preparePerformerGuideImage({
        name: 'photo.png',
        type: 'image/png',
        size: 11 * 1024 ** 2,
      }),
    ).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });
});

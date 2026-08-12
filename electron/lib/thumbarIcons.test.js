import { describe, it, expect } from 'vitest';
import { renderGlyphPng, GLYPHS } from './thumbarIcons.js';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe('thumbarIcons', () => {
  for (const glyph of GLYPHS) {
    it(`renders ${glyph} as a valid PNG at the requested size`, () => {
      const png = renderGlyphPng(glyph, { size: 20 });
      expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      // IHDR: 8 (signature) + 4 (length) + 4 (type) = 16, then width/height
      expect(png.readUInt32BE(16)).toBe(20);
      expect(png.readUInt32BE(20)).toBe(20);
    });
  }

  it('produces a different buffer per glyph', () => {
    const buffers = GLYPHS.map((glyph) => renderGlyphPng(glyph, { size: 16 }));
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        expect(buffers[i].equals(buffers[j])).toBe(false);
      }
    }
  });

  it('produces a different buffer when the color changes', () => {
    const white = renderGlyphPng('play', {
      size: 16,
      color: { r: 255, g: 255, b: 255 },
    });
    const gray = renderGlyphPng('play', {
      size: 16,
      color: { r: 128, g: 128, b: 128 },
    });
    expect(white.equals(gray)).toBe(false);
  });

  it('throws on an unknown glyph', () => {
    expect(() => renderGlyphPng('rewind')).toThrow(/unknown thumbar glyph/);
  });
});

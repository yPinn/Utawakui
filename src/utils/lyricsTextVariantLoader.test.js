import { describe, expect, it, vi } from 'vitest';
import { createLyricsTextVariantLoader } from './lyricsTextVariantLoader.js';

const document = (text) => ({ lines: [{ text }] });

describe('lyrics text variant loader', () => {
  it('keeps empty and non-Chinese documents out of the converter dependency', () => {
    const load = vi.fn();
    const loader = createLyricsTextVariantLoader({ load });
    for (const text of ['', 'Hello', '你好こんにちは', '사랑']) {
      const source = document(text);
      expect(loader.prepare(source)).toBeNull();
      expect(loader.project(source)).toBe(source);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('shares Chinese preparation and retains synchronous projections afterwards', async () => {
    const project = vi.fn((source) => source);
    const load = vi.fn(async () => ({ projectLyricsTextVariant: project }));
    const loader = createLyricsTextVariantLoader({ load });
    const source = document('这个世界');
    const first = loader.prepare(source);
    expect(loader.prepare(source)).toBe(first);
    await first;
    expect(loader.prepare(source)).toBeNull();
    expect(loader.project(source, { variant: 'original' })).toBe(source);
    expect(project).toHaveBeenCalledWith(source, { variant: 'original' });
    expect(load).toHaveBeenCalledOnce();
  });

  it('retries failed imports instead of caching a rejected promise', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValue({ projectLyricsTextVariant: (source) => source });
    const loader = createLyricsTextVariantLoader({ load });
    await expect(loader.prepare(document('中文'))).rejects.toThrow(
      'load failed',
    );
    await loader.prepare(document('中文'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('loads the real converter and preserves original / traditional synchronous toggles', async () => {
    const loader = createLyricsTextVariantLoader();
    const source = {
      documentId: 'source',
      lines: [{ text: '这个世界', startMs: 1000 }],
    };
    await loader.prepare(source);
    expect(loader.project(source).lines[0]).toMatchObject({
      text: '這個世界',
      startMs: 1000,
    });
    expect(loader.project(source, { variant: 'original' })).toBe(source);
    expect(loader.project(source).lines[0].text).toBe('這個世界');
  });
});

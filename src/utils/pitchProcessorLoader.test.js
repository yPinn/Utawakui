import { describe, expect, it, vi } from 'vitest';
import { createPitchProcessorLoader } from './pitchProcessorLoader.js';

describe('pitch processor loading boundary', () => {
  it('keeps the engine unloaded until requested and shares concurrent loads', async () => {
    const processor = vi.fn();
    const importModule = vi.fn(async () => ({ default: processor }));
    const load = createPitchProcessorLoader(importModule);
    expect(importModule).not.toHaveBeenCalled();
    const first = load();
    const second = load();
    expect(first).toBe(second);
    expect(await first).toBe(processor);
    expect(processor.moduleUrl).toBeTruthy();
    expect(processor.moduleUrl).not.toMatch(/^blob:/);
    expect(await load()).toBe(processor);
    expect(importModule).toHaveBeenCalledOnce();
  });

  it('allows a module-load failure to be retried', async () => {
    const processor = vi.fn();
    const importModule = vi
      .fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce({ default: processor });
    const load = createPitchProcessorLoader(importModule);
    await expect(load()).rejects.toThrow('load failed');
    expect(await load()).toBe(processor);
    expect(importModule).toHaveBeenCalledTimes(2);
  });
});

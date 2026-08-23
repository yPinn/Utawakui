import { describe, expect, it } from 'vitest';
import {
  buildLrclibUserAgent,
  createLrclibClient,
  normalizeLrclibRecord,
  parseLyricsfile,
  sharedLrclibRequestScheduler,
} from '../lrclib.js';

describe('lrclib compatibility barrel', () => {
  it('keeps legacy and refactored named CJS exports statically discoverable', () => {
    expect(buildLrclibUserAgent).toBeTypeOf('function');
    expect(createLrclibClient).toBeTypeOf('function');
    expect(normalizeLrclibRecord).toBeTypeOf('function');
    expect(parseLyricsfile).toBeTypeOf('function');
    expect(sharedLrclibRequestScheduler).toMatchObject({
      schedule: expect.any(Function),
      deferFor: expect.any(Function),
    });
  });
});

import { describe, expect, it } from 'vitest';

import { resolvePreviewSegment } from './trackPreviewSegment.js';

const structure = {
  sections: [
    { role: 'intro', startMs: 0, endMs: 12000 },
    { role: 'verse', startMs: 12000, endMs: 48000 },
    { role: 'chorus', startMs: 48000, endMs: 70000 },
    { role: 'chorus', startMs: 120000, endMs: 140000 },
  ],
};

describe('resolvePreviewSegment', () => {
  it('starts at the first analysed chorus', () => {
    expect(resolvePreviewSegment({ durationSeconds: 200, structure })).toEqual({
      start: 48,
      end: 78,
      source: 'chorus',
    });
  });

  it('falls back to 30% of the duration without a chorus', () => {
    expect(
      resolvePreviewSegment({ durationSeconds: 200, structure: null }),
    ).toEqual({ start: 60, end: 90, source: 'estimated' });
  });

  it('slides a late start back so the window fits before the end', () => {
    expect(
      resolvePreviewSegment({
        durationSeconds: 60,
        structure: { sections: [{ role: 'chorus', startMs: 50000 }] },
      }),
    ).toEqual({ start: 30, end: 60, source: 'chorus' });
  });

  it('plays a short track whole', () => {
    expect(resolvePreviewSegment({ durationSeconds: 20 })).toEqual({
      start: 0,
      end: 20,
      source: 'estimated',
    });
  });

  it('ignores malformed sections and unknown durations', () => {
    expect(
      resolvePreviewSegment({
        durationSeconds: Number.NaN,
        structure: { sections: [{ role: 'chorus', startMs: -1 }, null] },
      }),
    ).toEqual({ start: 0, end: 30, source: 'estimated' });
  });
});

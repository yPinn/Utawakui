import { expect, it } from 'vitest';
import {
  waveformPath,
  waveformMarkers,
  waveformRange,
  waveformLineFocus,
  waveformGaps,
} from './waveformPresentation.js';
it('bounds continuous windows by the media, including the short last tile', () => {
  expect(waveformRange(30000, 14500, 1000)).toEqual({
    fromMs: 14500,
    toMs: 15500,
  });
  expect(waveformRange(21300, 29000, 1000)).toEqual({
    fromMs: 20300,
    toMs: 21300,
  });
  expect(waveformRange(300, 500, 1000)).toEqual({ fromMs: 0, toMs: 300 });
});
it('identifies only uncovered media ranges for same-source overview preview, without stretching partial detail', () => {
  const tile = (start, end) => ({
    sampleRate: 100,
    frames: 3000,
    peaks: { startFrame: start, endFrame: end },
  });
  expect(waveformGaps([tile(0, 1000)], { fromMs: 9000, toMs: 11000 })).toEqual([
    { x: 320, width: 320 },
  ]);
  expect(
    waveformGaps([tile(1000, 2000)], { fromMs: 9000, toMs: 11000 }),
  ).toEqual([{ x: 0, width: 320 }]);
  expect(
    waveformGaps([tile(0, 1000), tile(1000, 2000)], {
      fromMs: 9000,
      toMs: 11000,
    }),
  ).toEqual([]);
  expect(waveformGaps([], { fromMs: 0, toMs: 1000 })).toEqual([
    { x: 0, width: 640 },
  ]);
  expect(waveformGaps([], { fromMs: 0, toMs: 0 })).toEqual([]);
});
it('weights RMS energy by covered frames across tiles instead of averaging amplitudes or peaks', () => {
  const tile = (startFrame, endFrame, rms) => ({
    sampleRate: 100,
    frames: 4000,
    peaks: {
      startFrame,
      endFrame,
      strideFrames: endFrame - startFrame,
      min: Float32Array.of(-1),
      max: Float32Array.of(1),
      rms: Float32Array.of(rms),
    },
  });
  const a = tile(0, 1000, 0),
    b = tile(1000, 3000, 1);
  expect(waveformPath([a, b], { fromMs: 9000, toMs: 12000 }, 'rms')).toBe(
    'M0,6V58',
  );
  expect(waveformPath([a, b], { fromMs: 9000, toMs: 11000 }, 'rms')).toBe(
    'M0,9V55',
  );
  expect(waveformPath([a], { fromMs: 10000, toMs: 11000 }, 'rms')).toBe('');
  expect(
    waveformPath(
      { peaks: { min: Float32Array.of(-1), max: Float32Array.of(1) } },
      null,
      'rms',
    ),
  ).toBe('');
});
it('projects selected saved/draft ranges independently, clipping visibility without inventing unknown ends or altering timing', () => {
  const document = {
    lines: [{ lineId: 'a', text: '詞', startMs: 9500, endMs: 11500 }],
  };
  const draft = { ...document.lines[0], startMs: 10000, endMs: 12000 };
  const before = JSON.stringify({ document, draft });
  const focus = waveformLineFocus(document, 'a', draft, 500, 30000, {
    fromMs: 9500,
    toMs: 11500,
  });
  expect(focus).toMatchObject({
    text: '詞',
    isDraft: true,
    changed: true,
    saved: { x: 0, width: 480, startX: null, endX: 480 },
    draft: { x: 0, width: 640, startX: 0, endX: 640 },
  });
  const unknown = waveformLineFocus(
    document,
    'a',
    { ...draft, endMs: null },
    10000,
    30000,
    { fromMs: 0, toMs: 2000 },
  );
  expect(unknown.draft).toMatchObject({
    x: null,
    width: 0,
    unknownEnd: true,
    startX: 0,
  });
  expect(unknown.saved.outside).toBe(true);
  expect(
    waveformLineFocus(document, 'missing', draft, 0, 30000, {
      fromMs: 0,
      toMs: 2000,
    }),
  ).toBeNull();
  expect(JSON.stringify({ document, draft })).toBe(before);
});
it('crops original extrema by absolute frame position without smoothing or changing peaks', () => {
  const min = new Float32Array(1000),
    max = new Float32Array(1000);
  min[250] = -0.5;
  max[250] = 1;
  max[700] = 1;
  const summary = {
    sampleRate: 100,
    frames: 2000,
    peaks: { startFrame: 1000, endFrame: 2000, strideFrames: 1, min, max },
  };
  const before = [...max];
  const path = waveformPath(summary, { fromMs: 12000, toMs: 13000 });
  expect(path).toContain('M320,0V48');
  expect(path).not.toContain('M160,0V48');
  expect([...max]).toEqual(before);
  expect(waveformPath(summary, { fromMs: 30000, toMs: 31000 })).toBe('');
});
it('draws bounded extrema without cancelling opposite phases', () => {
  const summary = {
    peaks: {
      min: new Float32Array(8192).fill(-1),
      max: new Float32Array(8192).fill(1),
    },
  };
  const path = waveformPath(summary);
  expect(path).toContain('M0,0V64');
  expect(path.length).toBeLessThan(20000);
});
it('renders a continuous viewport from two adjacent raw tiles without stretching either side', () => {
  const tile = (startFrame) => ({
    sampleRate: 100,
    frames: 3000,
    peaks: {
      startFrame,
      endFrame: startFrame + 1000,
      strideFrames: 1,
      min: new Float32Array(1000),
      max: new Float32Array(1000),
    },
  });
  const a = tile(0),
    b = tile(1000);
  a.peaks.min[950] = -1;
  a.peaks.max[950] = 1;
  b.peaks.min[50] = -0.5;
  b.peaks.max[50] = 0.5;
  const path = waveformPath([a, b], { fromMs: 9000, toMs: 11000 });
  expect(path).toContain('M160,0V64');
  expect(path).toContain('M480,16V48');
  expect(path.match(/M/g).length).toBeLessThanOrEqual(640);
  const partial = waveformPath([a], { fromMs: 9000, toMs: 11000 });
  expect(partial).toContain('M160,0V64');
  expect(partial).not.toContain('M320,0V64');
});
it('projects canonical minus offset, preserves out-of-media evidence and never applies tempo', () => {
  const value = waveformMarkers(
    {
      lines: [
        { lineId: 'a', startMs: 12000 },
        { lineId: 'b', startMs: 100 },
      ],
    },
    500,
    30000,
    10000,
    20000,
  );
  expect(value.markers).toEqual([{ id: 'a', ms: 11500, x: 96 }]);
  expect(value.outside).toBe(1);
});
it('does not stretch reserved trailing buckets into the actual media duration', () => {
  const min = new Float32Array(4096),
    max = new Float32Array(4096);
  min[1000] = -1;
  max[1000] = 1;
  const path = waveformPath({
    frames: 2000,
    peaks: { startFrame: 0, endFrame: 4096, strideFrames: 1, min, max },
  });
  expect(path).toContain('M320,0V64');
  expect(path).not.toContain('M156,0V64');
});

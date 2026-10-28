import { expect, it } from 'vitest';
import { waveformPath, waveformMarkers } from './waveformPresentation.js';
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

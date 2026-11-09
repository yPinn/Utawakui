import { expect, it } from 'vitest';
import { maskGuideActivity } from '../../prototypes/reference-pitch/guideActivity.cjs';

it('masks backing-dominated pitch and restores a weak tail near sustained guide energy', () => {
  const hz = 200;
  const pitch = new Float32Array(125).fill(hz);
  pitch[64] = 0;
  const backing = Float32Array.from({ length: pitch.length * 256 }, (_, i) =>
    Math.sin((i * hz * 2 * Math.PI) / 16_000),
  );
  const guide = backing.map(
    (sample, i) => sample * (i >= 12_800 && i < 15_360 ? 1.5 : 0.05),
  );

  const masked = maskGuideActivity(pitch, guide, backing);

  expect(masked[15]).toBe(0);
  expect(masked[49]).toBe(hz);
  expect(masked[64]).toBe(0);
  expect(masked[80]).toBe(hz);
  expect(masked[100]).toBe(0);
  expect(pitch[15]).toBe(hz);
});

import { expect, it } from 'vitest';
import {
  pitchAt,
  pitchCursor,
  pitchPage,
  pitchPlot,
  pitchSpan,
  pitchTimeTicks,
} from './referencePitchPlot.js';

it('draws a gap in the source clock and fits the final partial page', () => {
  const pitches = Float32Array.of(220, 220, 0, 330, 330);
  expect(pitchAt(pitches, 0.016, 0.032)).toBe(null);
  expect(pitchAt(pitches, 0.016, 0.032, 2.25)).toBe(null);
  expect(pitchAt(pitches, 0.016, 0, 2.25)).toBe(59.25);
  const original = pitchPlot(pitches, 0.016, 0, 8);
  const shifted = pitchPlot(pitches, 0.016, 0, 8, 2.25);
  expect(original.path.match(/M/g)).toHaveLength(2);
  expect(shifted.path.match(/M/g)).toHaveLength(2);
  expect(shifted.path.match(/[ML][\d.]+,/g)).toEqual(
    original.path.match(/[ML][\d.]+,/g),
  );
  expect(shifted.path).not.toBe(original.path);
  expect(pitchPage(17, 17)).toBe(16);
  expect(pitchCursor(17, 16, pitchSpan(16, 17))).toBe(320);
  expect(pitchCursor(8.5, 8, 8)).toBe(20);
});

it('marks only a single-frame excursion and keeps gaps and sustained notes', () => {
  const step = 0.016;
  const pitches = Float32Array.of(
    440,
    440,
    440,
    110,
    440,
    440,
    440,
    0,
    330,
    330,
    330,
    330,
    330,
    0,
    220,
    220,
    440,
    440,
    440,
    440,
    440,
    0,
    200,
  );
  const original = pitches.slice();
  const plot = pitchPlot(pitches, step, 0, 8);
  expect(plot.markers).toEqual([{ time: 3 * step, midi: 45, x: 1.92, y: 177 }]);
  expect(plot.path.match(/[ML]/g)).toHaveLength(19);
  expect(plot.path.match(/M/g)).toHaveLength(6);
  const withoutSpike = pitches.slice();
  withoutSpike[3] = 0;
  expect(plot.grid).toEqual(pitchPlot(withoutSpike, step, 0, 8).grid);
  expect(pitchAt(pitches, step, 3 * step)).toBe(45);
  expect(pitches).toEqual(original);
  expect(pitchPlot(pitches, step, 3 * step, step).markers).toHaveLength(1);
  expect(
    pitchPlot(Float32Array.of(440, 440, 220, 0, 440), step, 0, 8).markers,
  ).toHaveLength(0);
});

it('limits supported short jitter to 15 cents without rounding gaps or slides', () => {
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const step = 0.016;
  const jitter = [69, 69, 69.4, 69, 69].map(hz);
  const zigzag = [69.4, 69, 69.4, 69, 69.4].map(hz);
  const rise = [69, 69.1, 69.4, 69.45, 69.5].map(hz);
  const nearGap = [0, ...jitter.slice(1)];
  expect(pitchPlot(jitter, step, 0, 8).path).toContain('L1.28,131.25');
  expect(pitchPlot(zigzag, step, 0, 8).path).toContain('L1.28,131.25');
  expect(pitchPlot(rise, step, 0, 8).path).toContain('L1.28,129.00');
  expect(pitchPlot(nearGap, step, 0, 8).path).toContain('L1.28,129.00');
  expect(pitchPlot(jitter, step, 2 * step, 8).path).toContain('M0.00,131.25');
  expect(pitchAt(jitter, step, 2 * step)).toBeCloseTo(69.4);
});

it('preserves the peaks and troughs of sustained vibrato', () => {
  const step = 0.016;
  const notes = Array.from(
    { length: 40 },
    (_, index) => 69 + 0.35 * Math.sin(2 * Math.PI * 6 * index * step),
  );
  const pitches = notes.map((midi) => 440 * 2 ** ((midi - 69) / 12));
  const { path } = pitchPlot(pitches, step, 0, 8);
  const heights = [...path.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((match) =>
    Number(match[1]),
  );
  expect(heights).toEqual(
    notes.map((midi) => Number(((75 - midi) * 15).toFixed(2))),
  );
});

it('keeps five readable time ticks at each full-page scale', () => {
  for (const scale of [4, 8, 16]) {
    const start = pitchPage(19, 44, scale);
    const span = pitchSpan(start, 44, scale);
    expect(pitchTimeTicks(start, span, scale).map((tick) => tick.time)).toEqual(
      Array.from({ length: 5 }, (_, i) => start + (i * scale) / 4),
    );
  }
  expect(pitchTimeTicks(16, 3.1, 8).map((tick) => tick.time)).toEqual([
    16, 19.1,
  ]);
});

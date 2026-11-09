import { expect, it } from 'vitest';
import {
  applyGuideOctaveMarks,
  compareSingAlongPitch,
  clipGuideContour,
  createSingAlongClock,
  guideContourPath,
  guideContours,
  guideNoteGeometry,
  guideNotes,
  guideSilenceRanges,
  guideTechniqueMarkers,
  inputLevelPath,
  maskGuideContours,
  connectMicFrames,
  projectMicSamplePosition,
  songPitchBounds,
} from './singAlongPitchPlot.js';

it('plots level independently of pitch and separates discontinuous samples', () => {
  expect(
    inputLevelPath(
      [
        { time: 0, dbfs: -65, hz: null, continuous: false },
        { time: 1, dbfs: -20, hz: null, continuous: true },
        { time: 2, dbfs: -20, hz: 440, continuous: false },
        { time: 3, dbfs: -20, hz: 440, continuous: true },
      ],
      0,
      2.5,
      (time) => time,
    ),
  ).toBe('M0.00,16L0.00,16.00L1.00,2.00L1.00,16ZM2.00,16L2.00,2.00L2.00,16Z');
});

const toHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const step = 0.016;

it('compares the latest pitch with the guide at the aligned time and key', () => {
  const guide = [{ start: 2, end: 3, points: [{ midi: 67 }] }];
  for (const [cents, direction] of [
    [-35, 'low'],
    [0, 'center'],
    [35, 'high'],
  ]) {
    expect(
      compareSingAlongPitch(
        { time: 2.5, hz: toHz(69 + cents / 100) },
        guide,
        2,
      ),
    ).toMatchObject({ time: 2.5, midi: 69, direction });
  }
  expect(compareSingAlongPitch({ time: 3, hz: 440 }, guide, 2)).toBeNull();
  expect(compareSingAlongPitch({ time: 2.5, hz: null }, guide, 2)).toBeNull();
  expect(
    compareSingAlongPitch({ time: 2.5, hz: toHz(70) }, guide, 2),
  ).toBeNull();
});

const toContours = (values) =>
  guideContours(
    values.map((midi) => (midi === null ? 0 : toHz(midi))),
    step,
  );
const toNotes = (values) =>
  guideNotes(
    values.map((midi) => (midi === null ? 0 : toHz(midi))),
    step,
  );
const edges = (contours) =>
  contours.map(({ start, end }) => [
    Math.round(start / step),
    Math.round(end / step),
  ]);

it('applies reviewed octaves only to the chosen frames and leaves the source and silence intact', () => {
  const original = Float32Array.of(370, 185, 0, 185, 185, 392);
  const marks = [
    { label: 'octave-up', fromMs: 46960, toMs: 47024 },
    { label: 'octave-up', fromMs: 46992, toMs: 47008 },
    { label: 'octave-down', fromMs: 47008, toMs: 47024 },
    { label: 'no-voice', fromMs: 46976, toMs: 46992 },
  ];
  const shown = applyGuideOctaveMarks(original, 0.016, marks, 46944);
  expect([...shown]).toEqual([370, 370, 0, 370, 185, 392]);
  expect([...original]).toEqual([370, 185, 0, 185, 185, 392]);
  expect(guideSilenceRanges(marks)).toEqual([[46.976, 46.992]]);
});

it('cuts confirmed silence at exact media times and protects conflicting marks', () => {
  const original = [
    {
      start: 28.9,
      end: 29.8,
      points: [
        { time: 28.9, midi: 60 },
        { time: 29.8, midi: 64 },
      ],
    },
  ];
  const ranges = guideSilenceRanges([
    { label: 'no-voice', fromMs: 28976, toMs: 29632 },
    { label: 'voice', fromMs: 29100, toMs: 29200 },
    { label: 'unsure', fromMs: 29300, toMs: 29400 },
  ]);
  const shown = maskGuideContours(original, ranges);
  expect(shown.map(({ start, end }) => [start, end])).toEqual([
    [28.9, 28.976],
    [29.1, 29.2],
    [29.3, 29.4],
    [29.632, 29.8],
  ]);
  expect(shown[1].points[0].midi).toBeCloseTo(60.8889);
  expect(original[0].points).toHaveLength(2);
});

it('uses the whole song, preserves sustained extremes, and excludes isolated pitch outliers', () => {
  const notes = [
    [30, 0.08],
    [45, 0.3],
    [60, 80],
    [66, 80],
    [98, 0.08],
  ].map(([midi, end]) => ({ start: 0, end, points: [{ midi }] }));
  expect(songPitchBounds(notes, 0)).toEqual({ low: 42, high: 75 });
  expect(songPitchBounds(notes, 3)).toEqual({ low: 45, high: 78 });
  expect(songPitchBounds([], null)).toEqual({ low: 36, high: 84 });
});

it('eases clock drift during playback, freezes at pause, and snaps on seek', () => {
  const clock = createSingAlongClock();
  const snapshot = (status, positionMs, nowMs) => ({
    generatedAt: new Date(nowMs).toISOString(),
    playback: { status, positionMs, rate: 1, durationMs: 5000 },
  });
  expect(clock.sync(snapshot('playing', 2000, 10000), 'a', 10000, 0)).toBe(
    2000,
  );
  expect(clock.sync(snapshot('playing', 2160, 10200), 'a', 10200, 200)).toBe(
    2200,
  );
  expect(clock.positionAt(216)).toBeCloseTo(2215.2);
  expect(clock.positionAt(1000)).toBe(2960);
  expect(clock.sync(snapshot('paused', 3000, 11040), 'a', 11040, 1040)).toBe(
    3000,
  );
  expect(clock.positionAt(1200)).toBe(3000);
  expect(clock.sync(snapshot('playing', 3000, 11200), 'a', 11224, 1224)).toBe(
    3000,
  );
  expect(clock.positionAt(1240)).toBeGreaterThan(3000);
  expect(clock.sync(snapshot('playing', 1200, 11250), 'b', 11250, 1250)).toBe(
    1200,
  );
  expect(clock.positionAt(6000)).toBe(5000);
});

it('keeps silence, abrupt note changes and short isolated notes', () => {
  const contours = toContours([69, 69, 70, 70, null, 76, 76, null, 71]);
  expect(edges(contours)).toEqual([
    [0, 2],
    [2, 4],
    [5, 7],
    [8, 9],
  ]);
  expect(edges(toContours([69, 69, 76, 76, 69, 69]))).toEqual([
    [0, 2],
    [2, 4],
    [4, 6],
  ]);
  expect(edges(toContours([69.45, 69.45, 69.6, 69.6]))).toEqual([[0, 4]]);
});

it('requires four frames outside either boundary and backdates a confirmed change', () => {
  for (const direction of [-1, 1]) {
    const inside = 69 + direction * 0.6;
    const outside = 69 + direction * 0.64;
    expect(edges(toContours([69, 69, inside, inside, inside, inside]))).toEqual(
      [[0, 6]],
    );
    expect(edges(toContours([69, 69, outside, outside, outside, 69]))).toEqual([
      [0, 6],
    ]);
    expect(
      edges(toContours([69, 69, outside, outside, outside, outside])),
    ).toEqual([
      [0, 2],
      [2, 6],
    ]);
  }
});

it('does not combine alternate sides or separated excursions to confirm a note', () => {
  expect(edges(toContours([69, 69, 69.64, 69.64, 68.36, 68.36, 69]))).toEqual([
    [0, 7],
  ]);
  expect(edges(toContours([69, 69, 69.64, 69.64, null, 69.64, 69.64]))).toEqual(
    [
      [0, 4],
      [5, 7],
    ],
  );
});

it('joins consecutive slide steps and shallow returning boundary jitter', () => {
  const slide = toContours([
    69, 69.2, 69.4, 69.6, 69.8, 70, 70.2, 70.4, 70.6, 70.8,
  ]);
  expect(edges(slide)).toEqual([[0, 10]]);
  expect(slide[0].points[4].midi).toBeCloseTo(69.8);
  const jitter = toContours([69.44, 69.43, 69.44, 69.53, 69.43, 69.45, 69.42]);
  expect(edges(jitter)).toEqual([[0, 7]]);
  expect(jitter[0].points).toHaveLength(2);
  expect(jitter[0].points.map(({ midi }) => midi)).toEqual([69, 69]);
  const sharp = toContours([69.55, 69.55, 69.65, 69.7]);
  expect(sharp[0].points.map(({ midi }) => midi)).toEqual([70, 70]);
});

it('draws a slide separately from the stable notes it connects', () => {
  const contours = toContours([
    69, 69, 69, 69.2, 69.4, 69.6, 69.8, 70, 70.2, 70.4, 70.6, 70.8, 71, 71, 71,
  ]);
  expect(edges(contours)).toEqual([
    [0, 2],
    [2, 13],
    [13, 15],
  ]);
  expect(contours[0].points[0].midi).toBe(contours[0].points[1].midi);
  expect(contours[1].points.at(-1).midi).toBeGreaterThan(
    contours[1].points[0].midi,
  );
  expect(contours[2].points[0].midi).toBe(contours[2].points[1].midi);
});

it('renders a glide as a mark on an adjacent note while keeping both stable pitches', () => {
  const [low, high] = toNotes([
    69, 69, 69, 69, 69, 69, 69, 69.2, 69.4, 69.6, 69.8, 70, 70.2, 70.4, 70.6,
    70.8, 71, 71, 71,
  ]);
  expect(edges([low, high])).toEqual([
    [0, 6],
    [6, 19],
  ]);
  expect(
    [low, high].map(({ points }) => points.map(({ midi }) => midi)),
  ).toEqual([
    [69, 69],
    [71, 71],
  ]);
  expect(high.technique.kind).toBe('rise');
  const box = guideNoteGeometry(
    high,
    (time) => time * 100,
    (midi) => midi,
  );
  expect(box).toMatchObject({ y: 67 });
  expect(
    guideTechniqueMarkers([high], (time) => time * 100, 0, 1),
  ).toMatchObject([{ kind: 'rise', x: expect.closeTo(18.4) }]);
  expect(guideTechniqueMarkers([high], (time) => time * 100, 0.2, 1)).toEqual(
    [],
  );
});

it('keeps annotations on their media time and omits colliding or masked markers', () => {
  const notes = [
    { start: 0.1, end: 0.2, technique: { kind: 'rise', time: 0.15 } },
    { start: 0.2, end: 0.3, technique: { kind: 'fall', time: 0.22 } },
    { start: 0.5, end: 0.6, technique: { kind: 'vibrato', time: 0.4 } },
    { start: 0.7, end: 0.9, technique: { kind: 'vibrato', time: 0.8 } },
  ];
  expect(
    guideTechniqueMarkers(notes, (time) => time * 100, 0, 1).map(({ x }) => x),
  ).toEqual([15, 80]);
});

it('keeps periodic vibrato inside one rectangular note without conflating distinct pitches', () => {
  const pitches = Array.from(
    { length: 48 },
    (_, index) => 69 + 0.72 * Math.sin((index * 2 * Math.PI) / 11),
  );
  const notes = toNotes([...pitches, null, 70, 70, 70, 72, 72, 72]);
  expect(edges(notes)).toEqual([
    [0, 48],
    [49, 52],
    [52, 55],
  ]);
  expect(notes[0].technique.kind).toBe('vibrato');
  expect(notes.map(({ points }) => points[0].midi)).toEqual([69, 70, 72]);
  expect(
    toNotes([69, 69, 69, 71, 71, 69, 69, 69]).every((note) => !note.technique),
  ).toBe(true);
});

it('omits unsupported short fragments without closing silence or deleting clear short notes', () => {
  const held = Array(6).fill(69);
  const notes = toNotes([
    71,
    null,
    ...held,
    72,
    72,
    ...held,
    null,
    61,
    61.7,
    null,
    ...held,
  ]);
  expect(edges(notes)).toEqual([
    [2, 8],
    [8, 10],
    [10, 16],
    [20, 26],
  ]);
  expect(notes[1].points[0].midi).toBe(72);
  expect(toContours([69, null, 71])).toHaveLength(2);
});

it('preserves a short landing at the correct octave before the next slide', () => {
  const contours = toContours([
    61.5, 64.13, 65.52, 66.7, 67.675, 68.11, 68.319, 68.291, 68.286, 68.383,
    68.621, 68.786, 68.906, 68.985, 68.995, 68.999,
  ]);
  expect(edges(contours)).toEqual([
    [0, 5],
    [5, 8],
    [8, 14],
    [14, 16],
  ]);
  expect(contours[1].points.map(({ midi }) => midi)).toEqual([68, 68]);
  expect(contours[2].points.at(-1).midi).toBeGreaterThan(68.9);
});

it('leaves a visible gap between adjacent note outlines', () => {
  const [first, second] = toContours([69, 69, 70, 70]);
  const x = (time) => time * 1000;
  const y = (midi) => midi;
  expect(guideContourPath(first.points, x, y)).toContain('L31.60,65.00');
  expect(guideContourPath(second.points, x, y)).toMatch(/^M32\.40,66\.00/);
});

it('joins adjacent stable fragments on the same note without closing silence', () => {
  const contours = toContours([
    69.4,
    69.4,
    69.4,
    69.4,
    68.7,
    68.7,
    68.7,
    68.7,
    null,
    69,
    69,
    71,
    71,
  ]);
  expect(edges(contours)).toEqual([
    [0, 8],
    [9, 11],
    [11, 13],
  ]);
  expect(contours.map((contour) => contour.points[0].midi)).toEqual([
    69, 69, 71,
  ]);
});

it('clips the guide slope to the page without changing its timing', () => {
  const [guide] = toContours([69, 69.2, 69.4, 69.6, 69.8]);
  const visible = clipGuideContour(guide, step / 2, 2.5 * step);
  expect(visible.points.map(({ time }) => time)).toEqual([
    step / 2,
    step,
    2 * step,
    2.5 * step,
  ]);
  expect(visible.points.at(0).midi).toBeCloseTo(69.1);
  expect(visible.points.at(-1).midi).toBeCloseTo(69.5);
  expect(
    guideContourPath(
      visible.points,
      (time) => time * 1000,
      (midi) => midi,
      { trimStart: false, trimEnd: false },
    ),
  ).toMatch(/^M8\.00,65\.10.*Z$/);
});

it('breaks the line around an isolated mic jump and preserves all measured pitches', () => {
  expect(edges(toContours([69, 69, 81, 69, 69]))).toEqual([[0, 5]]);
  const frames = [69, 69, 81, 69, 69, 69.25, 69, 69].map((midi, index) => ({
    time: index * 0.033,
    hz: toHz(midi),
    continuous: index > 0,
  }));
  const plotted = connectMicFrames(frames);
  expect(plotted.map(({ hz }) => hz)).toEqual(frames.map(({ hz }) => hz));
  expect(plotted[2]).toEqual({ ...frames[2], continuous: false });
  expect(plotted[3]).toEqual({ ...frames[3], continuous: false });
  expect(plotted[5]).toBe(frames[5]);
  const afterGap = frames.map((frame, index) =>
    index === 3 ? { ...frame, continuous: false } : frame,
  );
  expect(connectMicFrames(afterGap)[2]).toBe(afterGap[2]);
});

it('centers an analysis window on the song clock and drops a window crossing a seek', () => {
  const frame = { sampledAtMs: 200, windowMs: 40 };
  const positionAt = (time) => 12_000 + 1.5 * time;
  expect(projectMicSamplePosition(frame, 161, positionAt, 1.5)).toBeNull();
  expect(projectMicSamplePosition(frame, 160, positionAt, 1.5)).toBe(12_270);
});

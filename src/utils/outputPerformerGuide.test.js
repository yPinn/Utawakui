import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERFORMER_GUIDE,
  PERFORMER_GUIDE_MIN_SIZE,
  applyPerformerGuideShape,
  dragPerformerGuide,
  normalizePerformerGuide,
  snapPerformerGuide,
} from './outputPerformerGuide.js';

const canvasAspect = 16 / 9;
const guide = { shape: 'ellipse', x: 0.5, y: 0.5, width: 0.4, height: 0.6 };

describe('model placement geometry', () => {
  it('restores the default and bounds invalid stored or typed values', () => {
    expect(normalizePerformerGuide(null)).toEqual(DEFAULT_PERFORMER_GUIDE);
    expect(
      (DEFAULT_PERFORMER_GUIDE.width * canvasAspect) /
        DEFAULT_PERFORMER_GUIDE.height,
    ).toBeCloseTo(3 / 4);
    expect(
      normalizePerformerGuide({ x: -0.3, y: Infinity, width: 4, height: 0 }),
    ).toEqual({
      shape: 'ellipse',
      x: 0.5,
      y: DEFAULT_PERFORMER_GUIDE.y,
      width: 1,
      height: PERFORMER_GUIDE_MIN_SIZE,
    });
  });

  it.each([
    ['ellipse', 3 / 4],
    ['circle', 1],
    ['rectangle', 9 / 16],
    ['square', 1],
    ['roundedRectangle', 5 / 8],
  ])('switches to %s at the original height and center', (shape, aspect) => {
    const previous = {
      ...guide,
      shape: shape === 'square' ? 'circle' : 'square',
    };
    const selected = applyPerformerGuideShape(previous, shape);
    expect(selected).toMatchObject({ shape, x: guide.x, y: guide.y });
    expect(selected.height).toBeCloseTo(guide.height);
    expect((selected.width * canvasAspect) / selected.height).toBeCloseTo(
      aspect,
    );
  });

  it.each(['circle', 'square'])(
    'locks %s to equal pixel sides when resized',
    (shape) => {
      const locked = applyPerformerGuideShape(guide, shape);
      const dragged = dragPerformerGuide(
        locked,
        [-1, -1],
        { x: 0.1, y: 0.1 },
        canvasAspect,
      );
      expect(dragged.shape).toBe(shape);
      expect(dragged.width).toBeLessThan(locked.width);
      expect(dragged.height).toBeCloseTo(dragged.width * canvasAspect);
      expect(dragged.x + dragged.width / 2).toBeCloseTo(
        locked.x + locked.width / 2,
      );
      expect(dragged.y + dragged.height / 2).toBeCloseTo(
        locked.y + locked.height / 2,
      );

      const byWidth = normalizePerformerGuide(
        { ...locked, width: 0.3 },
        'width',
      );
      expect(byWidth.width).toBeCloseTo(0.3);
      expect(byWidth.height).toBeCloseTo(0.3 * canvasAspect);
      const byHeight = normalizePerformerGuide(
        { ...locked, height: 0.5 },
        'height',
      );
      expect(byHeight.width).toBeCloseTo(0.5 / canvasAspect);
      expect(byHeight.height).toBeCloseTo(0.5);
    },
  );

  it('constrains a wider preset to the canvas and keeps the ratio of a tiny preset', () => {
    const wide = applyPerformerGuideShape(
      { ...guide, x: 0.9, height: 1 },
      'rectangle',
    );
    expect(wide.x + wide.width / 2).toBeCloseTo(1);
    const tiny = applyPerformerGuideShape(
      { ...guide, shape: 'rectangle', height: 0.08 },
      'ellipse',
    );
    expect(tiny.width).toBe(PERFORMER_GUIDE_MIN_SIZE);
    expect((tiny.width * canvasAspect) / tiny.height).toBeCloseTo(3 / 4);
  });

  it('moves the whole ellipse and keeps its edges on the canvas', () => {
    expect(
      dragPerformerGuide(guide, [0, 0], { x: -1, y: 1 }, canvasAspect),
    ).toEqual({ ...guide, x: 0.2, y: 0.7 });
  });

  it('holds the opposite edge and adjusts only the dragged axis', () => {
    const resized = dragPerformerGuide(
      guide,
      [0, -1],
      { x: 0.4, y: -0.1 },
      canvasAspect,
    );
    expect(resized.height).toBeCloseTo(0.7);
    expect(resized.y + resized.height / 2).toBeCloseTo(0.8);
    expect(resized.width).toBe(guide.width);
    expect(resized.x).toBe(guide.x);
  });

  it('holds the opposite corner, preserves aspect ratio and stops at the edge', () => {
    const resized = dragPerformerGuide(
      guide,
      [1, 1],
      { x: 3, y: 3 },
      canvasAspect,
    );
    expect(resized.y + resized.height / 2).toBeCloseTo(1);
    expect(resized.x - resized.width / 2).toBeCloseTo(0.3);
    expect(resized.y - resized.height / 2).toBeCloseTo(0.2);
    expect(resized.width / resized.height).toBeCloseTo(
      guide.width / guide.height,
    );
  });

  it('keeps the starting corner and aspect ratio at the minimum size', () => {
    const resized = dragPerformerGuide(
      guide,
      [-1, -1],
      { x: 1, y: 1 },
      canvasAspect,
    );
    expect(resized.width).toBeCloseTo(PERFORMER_GUIDE_MIN_SIZE);
    expect(resized.x + resized.width / 2).toBeCloseTo(0.7);
    expect(resized.y + resized.height / 2).toBeCloseTo(0.8);
    expect(resized.width / resized.height).toBeCloseTo(
      guide.width / guide.height,
    );
  });

  it('snaps the center and outer edges to the nearest feasible guides', () => {
    const viewport = { width: 960, height: 540 };
    const centered = snapPerformerGuide(
      { ...guide, x: 1 / 3 + 0.004, y: 0.49 },
      [0, 0],
      viewport,
    );
    expect(centered.guide).toEqual({ ...guide, x: 1 / 3, y: 0.5 });
    expect(centered.matches).toEqual({
      x: { line: 1 / 3, anchor: 0 },
      y: { line: 0.5, anchor: 0 },
    });

    const aligned = snapPerformerGuide(
      { ...guide, x: 0.795, y: 0.305 },
      [0, 0],
      viewport,
    );
    expect(aligned.guide).toEqual({ ...guide, x: 0.8, y: 0.3 });
    expect(aligned.matches).toEqual({
      x: { line: 1, anchor: 1 },
      y: { line: 0, anchor: -1 },
    });
  });

  it('snaps different edges to interior guides without resizing the object', () => {
    const viewport = { width: 960, height: 540 };
    const current = {
      ...guide,
      x: 1 / 3 + 0.103,
      y: 2 / 3 - 0.103,
      width: 0.2,
      height: 0.2,
    };
    const snapped = snapPerformerGuide(current, [0, 0], viewport);
    expect(snapped.matches).toEqual({
      x: { line: 1 / 3, anchor: -1 },
      y: { line: 2 / 3, anchor: 1 },
    });
    expect(snapped.guide).toMatchObject({ width: 0.2, height: 0.2 });
    expect(snapped.guide.x - snapped.guide.width / 2).toBeCloseTo(1 / 3);
    expect(snapped.guide.y + snapped.guide.height / 2).toBeCloseTo(2 / 3);
  });

  it('keeps the engaged edge when the center approaches the same line', () => {
    const viewport = { width: 200, height: 540 };
    const current = { ...guide, x: 0.528, width: 0.08 };
    const initial = snapPerformerGuide(current, [0, 0], viewport);
    expect(initial.matches.x).toEqual({ line: 0.5, anchor: -1 });

    const moved = { ...current, x: 0.51 };
    const retained = snapPerformerGuide(
      moved,
      [0, 0],
      viewport,
      initial.matches,
    );
    expect(retained.matches.x).toEqual(initial.matches.x);
    expect(retained.guide.x).toBeCloseTo(0.54);
    expect(snapPerformerGuide(moved, [0, 0], viewport).matches.x).toEqual({
      line: 0.5,
      anchor: 0,
    });
  });

  it('releases an active guide only after leaving the larger snap range', () => {
    const viewport = { width: 960, height: 540 };
    const near = { ...guide, x: 0.5 + 9 / viewport.width };
    const previous = { x: { line: 0.5, anchor: 0 } };
    expect(snapPerformerGuide(near, [0, 0], viewport).matches.x).toBeNull();
    expect(snapPerformerGuide(near, [0, 0], viewport, previous).guide.x).toBe(
      0.5,
    );
    const away = { ...guide, x: 0.5 + 12 / viewport.width };
    expect(
      snapPerformerGuide(away, [0, 0], viewport, previous).matches.x,
    ).toBeNull();
  });

  it('snaps a resized edge without moving its opposite edge', () => {
    const viewport = { width: 960, height: 540 };
    const current = { ...guide, x: 0.4, width: 0.196 };
    const snapped = snapPerformerGuide(current, [1, 0], viewport);
    expect(snapped.matches).toEqual({ x: { line: 0.5, anchor: 1 }, y: null });
    expect(snapped.guide.x + snapped.guide.width / 2).toBeCloseTo(0.5);
    expect(snapped.guide.x - snapped.guide.width / 2).toBeCloseTo(
      current.x - current.width / 2,
    );
    expect(snapped.guide.height).toBe(current.height);
  });

  it('snaps corner resizes without changing their proportions or anchor', () => {
    const viewport = { width: 960, height: 540 };
    const current = { ...guide, x: 0.335, y: 0.43, width: 0.32, height: 0.4 };
    const snapped = snapPerformerGuide(current, [1, 1], viewport);
    expect(snapped.matches).toEqual({ x: { line: 0.5, anchor: 1 }, y: null });
    expect(snapped.guide.width / snapped.guide.height).toBeCloseTo(0.8);
    expect(snapped.guide.x - snapped.guide.width / 2).toBeCloseTo(
      current.x - current.width / 2,
    );
    expect(snapped.guide.y - snapped.guide.height / 2).toBeCloseTo(
      current.y - current.height / 2,
    );
  });

  it('ignores a corner target that would extend the other edge beyond the canvas', () => {
    const viewport = { width: 960, height: 540 };
    const current = { ...guide, x: 0.335, y: 0.798, width: 0.32, height: 0.4 };
    const snapped = snapPerformerGuide(current, [1, 1], viewport);
    expect(snapped.matches).toEqual({ x: null, y: { line: 1, anchor: 1 } });
    expect(snapped.guide.y + snapped.guide.height / 2).toBeCloseTo(1);
  });
});

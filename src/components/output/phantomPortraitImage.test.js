import { describe, expect, it, vi } from 'vitest';
import { maskEdge } from '../../../shared/outputPortraitImage.json';
import {
  adjustPortraitMask,
  applyPortraitEdits,
  constrainPortraitFrame,
  drawPortraitCrop,
  editPortraitLasso,
  portraitImageBounds,
  sharpenPortraitMask,
  snapPortraitFrame,
  squarePortraitFrame,
  zoomPortraitFrame,
} from './phantomPortraitImage.js';

describe('portrait photo editing', () => {
  it('fits the complete original into a square without an inferred mask', () => {
    expect(squarePortraitFrame(null, 240, 120)).toEqual({
      left: 0,
      top: -60,
      width: 240,
      height: 240,
    });
  });

  it('uses the visible bounds of an already-transparent image for alignment', () => {
    const pixels = new Uint8Array(maskEdge ** 2 * 4);
    for (let y = 80; y < 160; y++) {
      for (let x = 160; x < 240; x++) pixels[(y * maskEdge + x) * 4 + 3] = 255;
    }
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: pixels }),
        }),
      }),
    });
    try {
      expect(portraitImageBounds({ width: 240, height: 120 })).toEqual({
        left: 120,
        top: 30,
        width: 60,
        height: 30,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fits the detected subject into a square with space around it', () => {
    const alpha = new Uint8Array(100);
    for (let y = 2; y < 6; y++) alpha.fill(255, y * 10 + 1, y * 10 + 4);
    const frame = squarePortraitFrame(alpha, 200, 100, 10);
    expect(frame.width).toBeCloseTo(69.6);
    expect(frame.height).toBe(frame.width);
    expect(frame.left + frame.width / 2).toBeCloseTo(50);
    expect(frame.top + frame.height / 2).toBeCloseTo(40);
  });

  it('preserves the zoom anchor and permits transparent padding in the square', () => {
    const photo = { width: 240, height: 120 };
    const frame = { left: 0, top: 0, width: 240, height: 120 };
    expect(zoomPortraitFrame(frame, 0.5, 0, 1)).toEqual({
      left: 0,
      top: 60,
      width: 120,
      height: 60,
    });
    const overflow = { left: -20, top: -20, width: 120, height: 120 };
    expect(
      constrainPortraitFrame({ ...overflow, left: -80, top: -80 }, photo),
    ).toEqual({
      ...overflow,
      left: -60,
      top: -60,
    });
    expect(constrainPortraitFrame(overflow, photo)).toEqual(overflow);
  });

  it('draws a square crop without stretching the source image', () => {
    let drawArgs;
    const canvas = {
      getContext: () => ({
        clearRect() {},
        drawImage: (...args) => {
          drawArgs = args;
        },
      }),
    };
    const photo = { width: 240, height: 120 };
    drawPortraitCrop(canvas, photo, {
      left: 0,
      top: -20,
      width: 120,
      height: 120,
    });
    expect([canvas.width, canvas.height]).toEqual([240, 240]);
    expect(drawArgs.slice(2)).toEqual([40, 480, 240]);
  });

  it('snaps subject centers to guide lines and the bottom to the canvas edge', () => {
    const subject = { left: 60, top: 64, width: 40, height: 35 };
    const viewport = { width: 360, height: 360 };
    const frame = { left: 39, top: -20, width: 120, height: 120 };
    const snap = snapPortraitFrame(frame, subject, viewport);
    expect(snap.vertical.line).toBe(1 / 3);
    expect(snap.horizontal.line).toBe(1);
    expect(snap.frame).toEqual({ ...frame, left: 40, top: -21 });
    const center = snapPortraitFrame(
      { ...frame, left: 21, top: 21 },
      subject,
      viewport,
    );
    expect(center.vertical.line).toBe(0.5);
    expect(center.horizontal.line).toBe(0.5);
    expect(center.frame.top).toBe(21.5);
  });

  it('uses screen distance and holds an engaged guide across small movements', () => {
    const subject = { left: 60, top: 64, width: 40, height: 35 };
    const viewport = { width: 360, height: 360 };
    const frame = { left: 20, top: 6, width: 120, height: 120 };
    const engaged = snapPortraitFrame(frame, subject, viewport);
    const near = { ...frame, left: 23 };
    expect(engaged.frame.left).toBe(20);
    expect(snapPortraitFrame(near, subject, viewport).vertical).toBeNull();
    expect(snapPortraitFrame(near, subject, viewport, engaged).frame.left).toBe(
      20,
    );
    expect(
      snapPortraitFrame({ ...frame, left: 26 }, subject, viewport, engaged)
        .vertical,
    ).toBeNull();
  });

  it('adjusts the subject edges in either direction from the original mask', () => {
    const edge = 9;
    const alpha = new Uint8Array(edge ** 2);
    for (let y = 2; y <= 6; y++) alpha.fill(220, y * edge + 2, y * edge + 7);
    const original = alpha.slice();
    const keep = adjustPortraitMask(alpha, -25, edge);
    const remove = adjustPortraitMask(alpha, 25, edge);
    expect(keep[4 * edge + 1]).toBeGreaterThan(0);
    expect(remove[4 * edge + 2]).toBe(0);
    expect(remove[4 * edge + 4]).toBeGreaterThan(0);
    expect(keep.every((value, index) => value >= alpha[index])).toBe(true);
    expect(remove.every((value, index) => value <= alpha[index])).toBe(true);
    expect(adjustPortraitMask(alpha, 0, edge)).toBe(alpha);
    expect(alpha).toEqual(original);
  });

  it('sharpens transparency edges without changing mask endpoints', () => {
    const alpha = new Uint8Array([0, 90, 165, 255]);
    expect(sharpenPortraitMask(alpha, 100)).toEqual(
      new Uint8Array([0, 0, 255, 255]),
    );
    expect(sharpenPortraitMask(alpha, 0)).toBe(alpha);
    expect(alpha).toEqual(new Uint8Array([0, 90, 165, 255]));
  });

  it('edits the enclosed area, feathers inward, and leaves the original mask untouched', () => {
    const edge = 12;
    const alpha = new Uint8Array(edge ** 2).fill(230);
    const points = [
      { x: 2, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: 10 },
      { x: 2, y: 10 },
    ];
    const center = 6 * edge + 6;
    const rim = 6 * edge + 2;
    const outside = 6 * edge + 1;
    const erasedEdits = editPortraitLasso(null, alpha, points, 'erase', edge);
    const erased = applyPortraitEdits(alpha, erasedEdits);
    expect(erased[center]).toBe(0);
    expect(erased[rim]).toBeGreaterThan(0);
    expect(erased[rim]).toBeLessThan(230);
    expect(erased[outside]).toBe(230);

    const restoredEdits = editPortraitLasso(
      erasedEdits,
      alpha,
      points,
      'restore',
      edge,
    );
    expect(applyPortraitEdits(alpha, restoredEdits)[center]).toBe(255);
    expect(applyPortraitEdits(alpha, erasedEdits)[center]).toBe(0);
    expect(alpha[center]).toBe(230);
  });

  it('ignores an open gesture with no enclosed area and an already transparent selection', () => {
    const edge = 12;
    const alpha = new Uint8Array(edge ** 2);
    const line = [
      { x: 2, y: 2 },
      { x: 6, y: 2 },
      { x: 10, y: 2 },
    ];
    expect(
      editPortraitLasso(null, alpha.fill(180), line, 'erase', edge),
    ).toBeNull();
    const triangle = [...line.slice(0, 2), { x: 4, y: 8 }];
    expect(
      editPortraitLasso(null, alpha.fill(0), triangle, 'erase', edge),
    ).toBeNull();
  });
});

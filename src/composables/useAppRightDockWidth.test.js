import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
// Prepare browser globals before renderer singleton imports.
vi.hoisted(() => vi.stubGlobal('window', {}));
import {
  RIGHT_DOCK_WIDTH_MAX,
  RIGHT_DOCK_WIDTH_MIN,
  useAppRightDockWidth,
} from './useAppRightDockWidth.js';

const dockWidth = useAppRightDockWidth();

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  dockWidth.setMaximum(RIGHT_DOCK_WIDTH_MAX);
  dockWidth.setWidth(RIGHT_DOCK_WIDTH_MAX);
});

describe('useAppRightDockWidth', () => {
  it('clamps direct and relative keyboard-sized width changes', () => {
    expect(RIGHT_DOCK_WIDTH_MAX).toBe(384);
    dockWidth.setWidth(RIGHT_DOCK_WIDTH_MIN - 50);
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MIN);

    dockWidth.resizeBy(24);
    expect(dockWidth.width.value).toBe(
      Math.min(RIGHT_DOCK_WIDTH_MAX, RIGHT_DOCK_WIDTH_MIN + 24),
    );

    dockWidth.setWidth(RIGHT_DOCK_WIDTH_MAX + 50);
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MAX);

    dockWidth.setWidth(Number.NaN);
    dockWidth.resizeBy(Number.POSITIVE_INFINITY);
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MAX);
  });

  it('anchors pointer drag to the starting width and reverses the right edge delta', () => {
    const listeners = new Map();
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      addEventListener: vi.fn((type, handler) => listeners.set(type, handler)),
      removeEventListener: vi.fn((type) => listeners.delete(type)),
    };
    const preventDefault = vi.fn();
    dockWidth.setWidth(RIGHT_DOCK_WIDTH_MIN);

    dockWidth.startResize({
      currentTarget: target,
      clientX: 100,
      pointerId: 7,
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
    expect(dockWidth.isResizing.value).toBe(false);

    listeners.get('pointermove')({ clientX: 94 });
    expect(dockWidth.isResizing.value).toBe(true);
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MIN + 6);
    listeners.get('pointermove')({ clientX: 70 });
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MIN + 30);

    listeners.get('pointerup')();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(dockWidth.isResizing.value).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it('clamps the displayed width without losing the preference, and bounds keyboard growth', () => {
    dockWidth.setWidth(384);
    dockWidth.setMaximum(300);
    expect(dockWidth.width.value).toBe(300);
    expect(dockWidth.preferredWidth.value).toBe(384);
    dockWidth.setMaximum(384);
    expect(dockWidth.width.value).toBe(384);
    dockWidth.setMaximum(300);
    dockWidth.resizeBy(8);
    expect(dockWidth.preferredWidth.value).toBe(300);
    dockWidth.setMaximum(NaN);
    expect(dockWidth.maximum.value).toBe(300);
  });

  it('restores the original preference when a constrained pointer drag is cancelled', () => {
    const listeners = new Map();
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name),
    };
    dockWidth.setWidth(384);
    dockWidth.setMaximum(300);
    dockWidth.startResize({
      currentTarget: target,
      clientX: 100,
      pointerId: 1,
      preventDefault: vi.fn(),
    });
    listeners.get('pointermove')({ clientX: 80 });
    expect(dockWidth.preferredWidth.value).toBe(300);
    listeners.get('pointercancel')();
    expect(dockWidth.preferredWidth.value).toBe(384);
    dockWidth.setMaximum(384);
    expect(dockWidth.width.value).toBe(384);
  });
});

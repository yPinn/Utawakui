import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RIGHT_DOCK_WIDTH_MAX,
  RIGHT_DOCK_WIDTH_MIN,
  useAppRightDockWidth,
} from './useAppRightDockWidth.js';

const dockWidth = useAppRightDockWidth();

afterEach(() => {
  dockWidth.width.value = RIGHT_DOCK_WIDTH_MAX;
});

describe('useAppRightDockWidth', () => {
  it('clamps direct and relative keyboard-sized width changes', () => {
    dockWidth.setWidth(RIGHT_DOCK_WIDTH_MIN - 50);
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MIN);

    dockWidth.resizeBy(24);
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MIN + 24);

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
    dockWidth.setWidth(240);

    dockWidth.startResize({
      currentTarget: target,
      clientX: 100,
      pointerId: 7,
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
    expect(dockWidth.isResizing.value).toBe(false);

    listeners.get('pointermove')({ clientX: 80 });
    expect(dockWidth.isResizing.value).toBe(true);
    expect(dockWidth.width.value).toBe(260);

    listeners.get('pointerup')();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(dockWidth.isResizing.value).toBe(false);
    expect(listeners.size).toBe(0);
  });
});

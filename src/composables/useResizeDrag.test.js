import { describe, expect, it, vi } from 'vitest';
import { useResizeDrag } from './useResizeDrag.js';

function makeTarget() {
  return {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makeEvent(overrides = {}) {
  return {
    preventDefault: vi.fn(),
    currentTarget: makeTarget(),
    clientX: 100,
    pointerId: 1,
    ...overrides,
  };
}

function moveHandlerFrom(target) {
  return target.addEventListener.mock.calls.find(
    ([name]) => name === 'pointermove',
  )[1];
}

function upHandlerFrom(target) {
  return target.addEventListener.mock.calls.find(
    ([name]) => name === 'pointerup',
  )[1];
}

function cancelHandlerFrom(target) {
  return target.addEventListener.mock.calls.find(
    ([name]) => name === 'pointercancel',
  )[1];
}

describe('useResizeDrag', () => {
  it('starts not resizing', () => {
    const { isResizing } = useResizeDrag({ onMove: vi.fn() });
    expect(isResizing.value).toBe(false);
  });

  it('captures the pointer but waits for deliberate movement before resizing', () => {
    const onMove = vi.fn();
    const { isResizing, startResize } = useResizeDrag({ onMove });
    const event = makeEvent();

    startResize(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
    expect(isResizing.value).toBe(false);
  });

  it('keeps click and double-click movement below the activation distance out of the resize lifecycle', () => {
    const onMove = vi.fn();
    const onCommit = vi.fn();
    const { isResizing, startResize } = useResizeDrag({ onMove, onCommit });
    const event = makeEvent({ clientX: 100 });

    startResize(event);
    moveHandlerFrom(event.currentTarget)({ clientX: 104 });
    upHandlerFrom(event.currentTarget)();

    expect(onMove).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(isResizing.value).toBe(false);
  });

  it('starts resizing after the activation distance and reports the raw delta', () => {
    const onMove = vi.fn();
    const { isResizing, startResize } = useResizeDrag({ onMove });
    const event = makeEvent({ clientX: 100 });

    startResize(event);
    moveHandlerFrom(event.currentTarget)({ clientX: 105 });

    expect(isResizing.value).toBe(true);
    expect(onMove).toHaveBeenCalledWith(5);
  });

  it('inverts the delta when invert is true', () => {
    const onMove = vi.fn();
    const { startResize } = useResizeDrag({ onMove, invert: true });
    const event = makeEvent({ clientX: 100 });

    startResize(event);
    moveHandlerFrom(event.currentTarget)({ clientX: 105 });

    expect(onMove).toHaveBeenCalledWith(-5);
  });

  it('releases capture, removes listeners, resets isResizing, and commits once on pointerup', () => {
    const onCommit = vi.fn();
    const { isResizing, startResize } = useResizeDrag({
      onMove: vi.fn(),
      onCommit,
    });
    const event = makeEvent();

    startResize(event);
    const target = event.currentTarget;
    moveHandlerFrom(target)({ clientX: 105 });
    upHandlerFrom(target)();

    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(target.removeEventListener).toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
    );
    expect(target.removeEventListener).toHaveBeenCalledWith(
      'pointerup',
      expect.any(Function),
    );
    expect(target.removeEventListener).toHaveBeenCalledWith(
      'pointercancel',
      expect.any(Function),
    );
    expect(isResizing.value).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('cleans up a cancelled drag without committing', () => {
    const onCommit = vi.fn();
    const { isResizing, startResize } = useResizeDrag({
      onMove: vi.fn(),
      onCommit,
    });
    const event = makeEvent();

    startResize(event);
    const target = event.currentTarget;
    moveHandlerFrom(target)({ clientX: 105 });
    cancelHandlerFrom(target)();

    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(isResizing.value).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not require onCommit', () => {
    const { startResize } = useResizeDrag({ onMove: vi.fn() });
    const event = makeEvent();

    startResize(event);

    expect(() => upHandlerFrom(event.currentTarget)()).not.toThrow();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    clientX: 0,
    pointerId: 1,
    ...overrides,
  };
}

function moveHandlerFrom(target) {
  return target.addEventListener.mock.calls.find(
    ([name]) => name === 'pointermove',
  )[1];
}

describe('useStudioLibraryInspectorWidth', () => {
  // Module-scope singleton — re-import fresh per test so drag state from one
  // test doesn't leak into the next, same isolation pattern this file's
  // sibling composables rely on.
  beforeEach(() => {
    vi.resetModules();
  });

  it('defaults to the max of its draggable range (280px)', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { width, isResizing } = useStudioLibraryInspectorWidth();

    expect(width.value).toBe(280);
    expect(isResizing.value).toBe(false);
  });

  it('grows when the handle is dragged left (inverted delta)', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { width, startResize } = useStudioLibraryInspectorWidth();

    // Width opens at its max, so shrink first to leave headroom to grow into.
    const shrinkEvent = makeEvent({ clientX: 200 });
    startResize(shrinkEvent);
    moveHandlerFrom(shrinkEvent.currentTarget)({ clientX: 240 }); // dragged right 40px
    expect(width.value).toBe(240);

    const growEvent = makeEvent({ clientX: 200 });
    startResize(growEvent);
    moveHandlerFrom(growEvent.currentTarget)({ clientX: 180 }); // dragged left 20px

    expect(width.value).toBe(260);
  });

  it('shrinks when the handle is dragged right', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { width, startResize } = useStudioLibraryInspectorWidth();
    const event = makeEvent({ clientX: 200 });

    startResize(event);
    moveHandlerFrom(event.currentTarget)({ clientX: 210 }); // dragged right 10px

    expect(width.value).toBe(270);
  });

  it('clamps to the minimum width', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { width, startResize } = useStudioLibraryInspectorWidth();
    const event = makeEvent({ clientX: 200 });

    startResize(event);
    moveHandlerFrom(event.currentTarget)({ clientX: 1000 }); // dragged far right

    expect(width.value).toBe(224);
  });

  it('clamps to the maximum width', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { width, startResize } = useStudioLibraryInspectorWidth();
    const event = makeEvent({ clientX: 200 });

    startResize(event);
    moveHandlerFrom(event.currentTarget)({ clientX: -1000 }); // dragged far left

    expect(width.value).toBe(280);
  });

  it('sets isResizing true during the drag', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { isResizing, startResize } = useStudioLibraryInspectorWidth();
    const event = makeEvent();

    startResize(event);

    expect(isResizing.value).toBe(true);
  });
});

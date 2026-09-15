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

  it('defaults to 240px (deliberately narrower than the fixed --ui-inspector-width token, tuned for a 1280px window)', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { width, isResizing } = useStudioLibraryInspectorWidth();

    expect(width.value).toBe(240);
    expect(isResizing.value).toBe(false);
  });

  it('grows when the handle is dragged left (inverted delta)', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { width, startResize } = useStudioLibraryInspectorWidth();
    const event = makeEvent({ clientX: 200 });

    startResize(event);
    moveHandlerFrom(event.currentTarget)({ clientX: 170 }); // dragged left 30px

    expect(width.value).toBe(270);
  });

  it('shrinks when the handle is dragged right', async () => {
    const { useStudioLibraryInspectorWidth } =
      await import('./useStudioLibraryInspectorWidth.js');
    const { width, startResize } = useStudioLibraryInspectorWidth();
    const event = makeEvent({ clientX: 200 });

    startResize(event);
    moveHandlerFrom(event.currentTarget)({ clientX: 210 }); // dragged right 10px

    expect(width.value).toBe(230);
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

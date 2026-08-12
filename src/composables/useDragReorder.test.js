import { describe, expect, it, vi } from 'vitest';
import { useDragReorder } from './useDragReorder.js';

function makeEvent(overrides = {}) {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: null,
    currentTarget: {
      getBoundingClientRect: () => ({ top: 0, height: 40 }),
      contains: () => false,
    },
    clientY: 10,
    relatedTarget: null,
    ...overrides,
  };
}

describe('useDragReorder', () => {
  it('starts with empty drag state', () => {
    const { draggingId, dropTargetId, dropPosition } = useDragReorder({
      onReorder: vi.fn(),
    });
    expect(draggingId.value).toBeNull();
    expect(dropTargetId.value).toBeNull();
    expect(dropPosition.value).toBeNull();
  });

  it('startDrag records the dragged id and primes dataTransfer', () => {
    const { draggingId, startDrag } = useDragReorder({ onReorder: vi.fn() });
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };
    const event = makeEvent({ dataTransfer });

    startDrag({ id: 'a' }, event);

    expect(draggingId.value).toBe('a');
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'a');
  });

  it('startDrag aborts via preventDefault when canDrag returns false', () => {
    const canDrag = vi.fn(() => false);
    const { draggingId, startDrag } = useDragReorder({
      onReorder: vi.fn(),
      canDrag,
    });
    const event = makeEvent();

    startDrag({ id: 'a' }, event);

    expect(canDrag).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(draggingId.value).toBeNull();
  });

  it('updateDropTarget ignores drags with no active draggingId or over itself', () => {
    const { dropTargetId, startDrag, updateDropTarget } = useDragReorder({
      onReorder: vi.fn(),
    });

    updateDropTarget({ id: 'b' }, makeEvent());
    expect(dropTargetId.value).toBeNull();

    startDrag({ id: 'a' }, makeEvent());
    updateDropTarget({ id: 'a' }, makeEvent());
    expect(dropTargetId.value).toBeNull();
  });

  it('updateDropTarget splits before/after on the vertical row midpoint', () => {
    const { dropTargetId, dropPosition, startDrag, updateDropTarget } =
      useDragReorder({ onReorder: vi.fn() });
    startDrag({ id: 'a' }, makeEvent());

    updateDropTarget({ id: 'b' }, makeEvent({ clientY: 5 })); // top half
    expect(dropTargetId.value).toBe('b');
    expect(dropPosition.value).toBe('before');

    updateDropTarget({ id: 'b' }, makeEvent({ clientY: 35 })); // bottom half
    expect(dropPosition.value).toBe('after');
  });

  it('leaveDropTarget clears only when the pointer actually left the row', () => {
    const { dropTargetId, startDrag, updateDropTarget, leaveDropTarget } =
      useDragReorder({ onReorder: vi.fn() });
    startDrag({ id: 'a' }, makeEvent());
    updateDropTarget({ id: 'b' }, makeEvent());
    expect(dropTargetId.value).toBe('b');

    // relatedTarget still inside the row (contains() -> true): stays.
    leaveDropTarget(
      { id: 'b' },
      makeEvent({
        currentTarget: { contains: () => true },
      }),
    );
    expect(dropTargetId.value).toBe('b');

    // relatedTarget outside the row: clears.
    leaveDropTarget({ id: 'b' }, makeEvent());
    expect(dropTargetId.value).toBeNull();
  });

  it('drop calls onReorder with dragged id, target id, and position, then clears state', () => {
    const onReorder = vi.fn();
    const { draggingId, dropTargetId, dropPosition, startDrag, drop } =
      useDragReorder({ onReorder });
    startDrag({ id: 'a' }, makeEvent());

    const event = makeEvent();
    drop({ id: 'b' }, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onReorder).toHaveBeenCalledWith('a', 'b', 'before');
    expect(draggingId.value).toBeNull();
    expect(dropTargetId.value).toBeNull();
    expect(dropPosition.value).toBeNull();
  });

  it('drop falls back to dataTransfer text when draggingId was never set (native DnD across components)', () => {
    const onReorder = vi.fn();
    const { drop } = useDragReorder({ onReorder });
    const event = makeEvent({
      dataTransfer: { getData: () => 'external-id' },
    });

    drop({ id: 'b' }, event);

    expect(onReorder).toHaveBeenCalledWith('external-id', 'b', 'before');
  });

  it('clearDragState resets all three refs independently of a drop', () => {
    const {
      draggingId,
      dropTargetId,
      dropPosition,
      startDrag,
      clearDragState,
    } = useDragReorder({ onReorder: vi.fn() });
    startDrag({ id: 'a' }, makeEvent());

    clearDragState();

    expect(draggingId.value).toBeNull();
    expect(dropTargetId.value).toBeNull();
    expect(dropPosition.value).toBeNull();
  });

  it('two independent instances do not share state', () => {
    const first = useDragReorder({ onReorder: vi.fn() });
    const second = useDragReorder({ onReorder: vi.fn() });

    first.startDrag({ id: 'a' }, makeEvent());

    expect(first.draggingId.value).toBe('a');
    expect(second.draggingId.value).toBeNull();
  });
});

import { ref } from 'vue';

/**
 * HTML5 drag-and-drop state for one single-column reorderable list.
 *
 * @param {Object} options
 * @param {(draggedId: string, targetId: string, position: 'before'|'after') => void} options.onReorder
 * @param {() => boolean} [options.canDrag]
 */
export function useDragReorder({ onReorder, canDrag = () => true } = {}) {
  const draggingId = ref(null);
  const dropTargetId = ref(null);
  const dropPosition = ref(null);

  function startDrag(item, event) {
    if (!canDrag()) {
      event.preventDefault();
      return;
    }

    draggingId.value = item.id;
    dropTargetId.value = null;
    dropPosition.value = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
    }
  }

  function updateDropTarget(item, event) {
    if (!draggingId.value || draggingId.value === item.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    // event.currentTarget is only valid synchronously within this handler —
    // a caller that forwards the event through an async/nextTick boundary
    // will find getBoundingClientRect() throwing on a null target. Forward
    // synchronously (see QueueSection.vue's @dragover handler for the
    // pattern this composable expects from its callers).
    const rect = event.currentTarget.getBoundingClientRect();
    dropTargetId.value = item.id;
    dropPosition.value =
      event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function leaveDropTarget(item, event) {
    if (
      dropTargetId.value === item.id &&
      !event.currentTarget.contains(event.relatedTarget)
    ) {
      dropTargetId.value = null;
      dropPosition.value = null;
    }
  }

  function drop(targetItem, event) {
    event.preventDefault();
    event.stopPropagation();
    const draggedId =
      draggingId.value || event.dataTransfer?.getData('text/plain');
    onReorder(draggedId, targetItem.id, dropPosition.value || 'before');
    clearDragState();
  }

  function clearDragState() {
    draggingId.value = null;
    dropTargetId.value = null;
    dropPosition.value = null;
  }

  return {
    draggingId,
    dropTargetId,
    dropPosition,
    startDrag,
    updateDropTarget,
    leaveDropTarget,
    drop,
    clearDragState,
  };
}

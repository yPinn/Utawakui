import { ref } from 'vue';

/**
 * HTML5 drag-and-drop reorder state machine for a single-column list.
 * Consolidates the five-function/three-ref dance that was independently
 * duplicated in SetlistView.vue (playlist tracks), PlaylistSidebar.vue
 * (playlist order), and PlaybackQueuePanel.vue (queued tracks and
 * upcoming-source tracks — two separate lists, so two separate calls,
 * not one shared instance). Unlike those singleton composables elsewhere
 * in this codebase (usePlayer, usePlaylists, ...), this is a plain
 * factory: every list needs its own independent drag state, so each
 * caller calls useDragReorder() once per list it owns.
 *
 * @param {Object} options
 * @param {(draggedId: string, targetId: string, position: 'before'|'after') => void} options.onReorder
 *   Called on a successful drop. Left entirely to the caller because
 *   "what reordering means" differs per list (splice a playlist's
 *   trackIds, splice the queue, ...) — this composable only owns the
 *   drag gesture, not the reorder side effect.
 * @param {() => boolean} [options.canDrag]
 *   Called at drag-start; returning false cancels the drag (mirrors each
 *   site's existing "nothing to reorder" guard: a single-item list, no
 *   selected playlist, etc). Defaults to always allowed.
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

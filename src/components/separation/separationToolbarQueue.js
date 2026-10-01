export function pendingReorderOffset(items, draggedId, targetId, position) {
  if (!['before', 'after'].includes(position)) return 0;
  const sourceIndex = items.findIndex(({ itemId }) => itemId === draggedId);
  const targetIndex = items.findIndex(({ itemId }) => itemId === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return 0;
  }

  let destinationIndex = targetIndex + (position === 'after' ? 1 : 0);
  if (sourceIndex < destinationIndex) destinationIndex -= 1;
  return destinationIndex - sourceIndex;
}

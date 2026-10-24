// Retired release ids remain valid references in live queues and immutable
// history snapshots. Resolve them without rebuilding any playback state.
export function collectionForSource(collections, id) {
  return collections.find(
    (collection) =>
      collection.id === id || collection.redirectedIds?.includes(id),
  );
}
export function resolveCollectionSourceId(collections, id) {
  return collectionForSource(collections, id)?.id ?? id;
}

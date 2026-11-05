const STARTED_PROGRESS = new Set(['playing', 'completed', 'interrupted']);

export function sessionPerformedItems({ items = [], timeline = [] } = {}) {
  const itemsById = new Map(items.map((item) => [item.itemId, item]));
  const observed = new Set();
  const performances = timeline
    .filter((entry) => entry.type === 'track')
    .sort(
      (left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
    )
    .map((entry) => {
      const item = itemsById.get(entry.itemId);
      if (item) observed.add(item.itemId);
      return {
        itemId: entry.id,
        trackId: entry.trackId,
        mode: entry.trackId ? 'library-track' : (item?.mode ?? 'manual'),
        displayTitle: entry.title,
        displayArtist: entry.artist,
        progress: STARTED_PROGRESS.has(item?.progress)
          ? item.progress
          : 'recorded',
      };
    });
  // Older sessions can contain results without a start event. Their saved
  // order is the only available order and does not imply a playback timestamp.
  return [
    ...performances,
    ...items.filter(
      (item) =>
        !observed.has(item.itemId) && STARTED_PROGRESS.has(item.progress),
    ),
  ];
}

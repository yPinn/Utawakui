export function rangeTrackIds(trackIds, anchorId, targetId) {
  if (!Array.isArray(trackIds) || !trackIds.includes(targetId)) return [];
  const anchorIndex = trackIds.indexOf(anchorId);
  const targetIndex = trackIds.indexOf(targetId);
  if (anchorIndex < 0) return [targetId];
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return trackIds.slice(start, end + 1);
}

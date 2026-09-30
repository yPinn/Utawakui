const OUTPUT_BYTES_PER_SECOND = 44_100 * 4 * 2;

export function buildSeparationPlan({
  currentTrack = null,
  queuedTracks = [],
  sourceUpcomingTracks = [],
} = {}) {
  const seen = new Set();
  return [
    ...(currentTrack ? [currentTrack] : []),
    ...queuedTracks,
    ...sourceUpcomingTracks,
  ].filter((track) => {
    if (!track?.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export function estimateSeparationOutput(tracks = []) {
  const durations = tracks
    .map(({ duration }) => duration)
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  const bytes = durations.reduce(
    (total, duration) => total + duration * OUTPUT_BYTES_PER_SECOND,
    0,
  );
  const mebibytes = bytes / 1024 ** 2;
  const label =
    mebibytes >= 1024
      ? `約 ${(mebibytes / 1024).toFixed(1)} GB`
      : `約 ${Math.max(1, Math.round(mebibytes))} MB`;
  return {
    knownTracks: durations.length,
    totalTracks: tracks.length,
    label: durations.length > 0 ? label : '',
  };
}

export function separationItemLabel(item) {
  switch (item?.status) {
    case 'pending':
      return '等候中';
    case 'checking':
      return '準備中';
    case 'running':
      return Number.isFinite(item.percent)
        ? `${Math.round(item.percent)}%`
        : '處理中';
    case 'completed':
      return '已完成';
    case 'skipped':
      return '已有伴奏';
    case 'failed':
      return '未完成';
    case 'cancelled':
      return '已停止';
    default:
      return '';
  }
}

export function separationQueueSummary(queue) {
  if (!queue) return '依播放順序逐首準備';
  if (queue.status === 'paused') {
    return `已暫停 · ${queue.pending ?? 0} 首等候中`;
  }
  if (['running', 'pausing'].includes(queue.status)) {
    return `已處理 ${queue.done} / ${queue.total} 首`;
  }
  const unfinished = (queue.failed ?? 0) + (queue.cancelled ?? 0);
  const finished = Math.max(0, queue.total - unfinished);
  return unfinished > 0
    ? `${finished} 首已完成 · ${unfinished} 首未完成`
    : `${finished} 首已完成`;
}

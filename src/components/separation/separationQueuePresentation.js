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

export function separationPlanSummary(tracks = []) {
  const count = `${tracks.length} 首`;
  if (tracks.length === 0) return count;
  const estimate = estimateSeparationOutput(tracks);
  if (!estimate.label || estimate.knownTracks !== estimate.totalTracks) {
    return count;
  }
  return `${count} · 最多新增${estimate.label}`;
}

export function separationSourceStatus(tracks = [], items = [], recipeId) {
  const queued = new Map();
  const openStatuses = new Set(['pending', 'checking', 'running']);
  for (const item of items) {
    if (item.recipeId !== recipeId) continue;
    // Retrying an old entry keeps its position before newer history.
    if (
      openStatuses.has(queued.get(item.trackId)) &&
      !openStatuses.has(item.status)
    )
      continue;
    queued.set(item.trackId, item.status);
  }
  const counts = { pending: 0, completed: 0, attention: 0 };
  for (const track of tracks) {
    const status = queued.get(track.id);
    if (status === 'pending') counts.pending++;
    else if (status === 'checking' || status === 'running') continue;
    else if (status === 'failed' || status === 'cancelled') counts.attention++;
    else if (
      status === 'completed' ||
      status === 'skipped' ||
      track.separation?.results?.[recipeId]
    )
      counts.completed++;
    else counts.pending++;
  }
  return [
    ['pending', '待處理'],
    ['completed', '已完成'],
    ['attention', '未完成'],
  ]
    .filter(([id]) => counts[id] > 0)
    .map(([id, label]) => ({ id, label, count: counts[id] }));
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
  if (!queue) return '依播放順序準備';
  if (queue.status === 'pausing') return '這首完成後暫停';
  if (queue.status === 'paused') {
    return `已暫停 · ${queue.pending ?? 0} 首待處理`;
  }
  if (queue.status === 'running') {
    return `已處理 ${queue.done} / ${queue.total} 首`;
  }
  const unfinished = (queue.failed ?? 0) + (queue.cancelled ?? 0);
  const finished = Math.max(0, queue.total - unfinished);
  return unfinished > 0
    ? `${finished} 首完成 · ${unfinished} 首未完成`
    : `${finished} 首完成`;
}

export function separationQueueIndicator(queue) {
  if (!queue) return { state: 'idle', label: '' };
  if (queue.status === 'running') {
    return {
      state: 'running',
      label: `處理中 ${queue.done ?? 0}/${queue.total ?? 0}`,
    };
  }
  if (queue.status === 'pausing') {
    return { state: 'pausing', label: '即將暫停' };
  }
  if (queue.status === 'paused') {
    return { state: 'paused', label: '已暫停' };
  }
  const unfinished = (queue.failed ?? 0) + (queue.cancelled ?? 0);
  if (unfinished > 0) {
    return { state: 'attention', label: `${unfinished} 首未完成` };
  }
  return { state: 'idle', label: '' };
}

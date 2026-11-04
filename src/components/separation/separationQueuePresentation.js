import { t } from '../../utils/i18n.js';
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
      ? t('queue.separation.aboutGb', { size: (mebibytes / 1024).toFixed(1) })
      : t('queue.separation.aboutMb', {
          size: Math.max(1, Math.round(mebibytes)),
        });
  return {
    knownTracks: durations.length,
    totalTracks: tracks.length,
    label: durations.length > 0 ? label : '',
  };
}

export function separationPlanSummary(tracks = []) {
  const count = t(
    'queue.separation.trackCount',
    { count: tracks.length },
    tracks.length,
  );
  if (tracks.length === 0) return count;
  const estimate = estimateSeparationOutput(tracks);
  if (!estimate.label || estimate.knownTracks !== estimate.totalTracks) {
    return count;
  }
  return t('queue.separation.planWithEstimate', {
    count,
    size: estimate.label,
  });
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
    ['pending', t('queue.separation.source.pending')],
    ['completed', t('queue.separation.item.completed')],
    ['attention', t('queue.separation.item.failed')],
  ]
    .filter(([id]) => counts[id] > 0)
    .map(([id, label]) => ({ id, label, count: counts[id] }));
}

export function separationItemLabel(item) {
  switch (item?.status) {
    case 'pending':
      return t('queue.separation.item.pending');
    case 'checking':
      return t('queue.separation.item.checking');
    case 'running':
      return Number.isFinite(item.percent)
        ? `${Math.round(item.percent)}%`
        : t('queue.separation.item.running');
    case 'completed':
      return t('queue.separation.item.completed');
    case 'skipped':
      return t('queue.separation.item.skipped');
    case 'failed':
      return t('queue.separation.item.failed');
    case 'cancelled':
      return t('queue.separation.item.cancelled');
    default:
      return '';
  }
}

export function separationQueueSummary(queue) {
  if (!queue) return t('queue.separation.idle');
  if (queue.status === 'pausing') return t('queue.separation.pausing');
  if (queue.status === 'paused') {
    return t('queue.separation.paused', { count: queue.pending ?? 0 });
  }
  if (queue.status === 'running') {
    return t('queue.separation.running', {
      done: queue.done,
      total: queue.total,
    });
  }
  const unfinished = (queue.failed ?? 0) + (queue.cancelled ?? 0);
  const finished = Math.max(0, queue.total - unfinished);
  return unfinished > 0
    ? t('queue.separation.finishedWithUnfinished', { finished, unfinished })
    : t('queue.separation.finished', { count: finished });
}

export function separationQueueIndicator(queue) {
  if (!queue) return { state: 'idle', label: '' };
  if (queue.status === 'running') {
    return {
      state: 'running',
      label: t('queue.separation.indicatorRunning', {
        done: queue.done ?? 0,
        total: queue.total ?? 0,
      }),
    };
  }
  if (queue.status === 'pausing') {
    return { state: 'pausing', label: t('queue.separation.indicatorPausing') };
  }
  if (queue.status === 'paused') {
    return { state: 'paused', label: t('queue.separation.indicatorPaused') };
  }
  const unfinished = (queue.failed ?? 0) + (queue.cancelled ?? 0);
  if (unfinished > 0) {
    return {
      state: 'attention',
      label: t('queue.separation.indicatorUnfinished', { count: unfinished }),
    };
  }
  return { state: 'idle', label: '' };
}

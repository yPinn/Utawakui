// Read-only projection of arrangement occurrences and canonical media lengths.
// Track lengths are not wall-clock singing time; manual items have no audio clock.
import { formatGroupedInteger, formatLongDuration } from './format.js';
import { t } from './i18n.js';

export function formatPerformanceSessionSummary(summary, items) {
  const count = t(
    items.every((item) => item.mode === 'library-track')
      ? 'session.summaryLine.tracks'
      : 'session.summaryLine.items',
    { count: formatGroupedInteger(summary.total) },
    summary.total,
  );
  const known = formatLongDuration(summary.knownDuration);
  const duration =
    summary.total && summary.unknownDurationCount === summary.total
      ? t('session.summaryLine.unknownDuration')
      : summary.unknownDurationCount && known
        ? t('session.summaryLine.knownPartial', { duration: known })
        : known;
  return duration
    ? t('session.summaryLine.joined', { count, duration })
    : count;
}

export function performanceSessionSummary(items, tracks, currentItemId = null) {
  const durations = new Map(tracks.map((track) => [track.id, track.duration]));
  const summary = {
    total: items.length,
    pending: 0,
    current: 0,
    completed: 0,
    skipped: 0,
    interrupted: 0,
    knownDuration: 0,
    unknownDurationCount: 0,
  };
  for (const item of items) {
    const progress = item.progress ?? 'queued';
    if (progress === 'queued') {
      if (item.itemId === currentItemId) summary.current += 1;
      else summary.pending += 1;
    } else if (progress === 'playing') summary.current += 1;
    else if (['completed', 'skipped', 'interrupted'].includes(progress))
      summary[progress] += 1;
    const duration =
      item.mode === 'manual' ? undefined : durations.get(item.trackId);
    if (Number.isFinite(duration) && duration > 0)
      summary.knownDuration += duration;
    else summary.unknownDurationCount += 1;
  }
  return summary;
}

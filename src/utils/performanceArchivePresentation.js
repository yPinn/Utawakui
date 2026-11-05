import { UI_LOCALE } from './uiLocale.js';
import { t } from './i18n.js';
import { sessionPerformedItems } from '../../shared/sessionPerformedItems.mjs';

export function performancePlaylistName({
  startedAt,
  name,
  existing = [],
  now = new Date(),
}) {
  const start = startedAt ? new Date(startedAt) : now;
  const date = Number.isNaN(start.getTime()) ? now : start;
  const prefix = [date.getFullYear() % 100, date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('');
  const base = `${prefix} - ${name?.trim() || t('session.export.defaultName')}`;
  const names = new Set(existing);
  let candidate = base.slice(0, 200).trimEnd();
  for (let index = 2; names.has(candidate); index++) {
    const suffix = ` (${index})`;
    candidate = `${base.slice(0, 200 - suffix.length).trimEnd()}${suffix}`;
  }
  return candidate;
}

export function performanceArchiveDate(value, { includeTime = true } = {}) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(UI_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    hour12: false,
  });
}

export function performanceArchiveProgress(completed, performed) {
  return Number.isInteger(performed) && performed !== completed
    ? t('session.archive.progress', { completed, performed })
    : t('session.archive.completedOnly', { completed }, completed);
}

export function performanceArchiveSummary(archive, { multiline = false } = {}) {
  const started = archive.startedAt;
  const date = performanceArchiveDate(started ?? archive.endedAt);
  const timing = t(
    started ? 'session.archive.startedAt' : 'session.archive.archivedAt',
    { date },
  );
  if (!Number.isInteger(archive.completedCount)) return timing;
  return t(
    multiline ? 'session.archive.noteBody' : 'session.archive.noteSummary',
    {
      timing,
      progress: performanceArchiveProgress(
        archive.completedCount,
        archive.performedCount,
      ),
    },
  );
}

const PROGRESS_LABELS = Object.freeze({
  playing: t('session.archiveStatus.playing'),
  completed: t('session.archiveStatus.completed'),
  interrupted: t('session.archiveStatus.interrupted'),
  recorded: t('session.archiveStatus.recorded'),
});
export function performanceArchiveRows(session, tracks) {
  const canonical = new Map(tracks.map((track) => [track.id, track]));
  return sessionPerformedItems(session ?? undefined).map((item, index) => ({
    key: item.itemId,
    ordinal: index + 1,
    title: item.displayTitle,
    artist: item.displayArtist,
    mode: item.mode,
    track: canonical.get(item.trackId) ?? null,
    progress: item.progress,
    status: PROGRESS_LABELS[item.progress] ?? '',
    statusDetail:
      item.mode === 'manual'
        ? t('session.archiveStatus.manualTrack')
        : !canonical.has(item.trackId)
          ? t('session.archiveStatus.noLocalTrack')
          : '',
  }));
}

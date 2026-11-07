import { UI_LOCALE } from './uiLocale.js';
import { t } from './i18n.js';
import { sessionPerformedItems } from '../../shared/sessionPerformedItems.mjs';

export function unlinkedPerformanceArchives(archives, playlists) {
  const linked = new Set(
    playlists.map((playlist) => playlist.performanceSessionId),
  );
  return (archives ?? []).filter((archive) => !linked.has(archive.id));
}

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

function validArchiveDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date : null;
}

function archiveTiming(archive) {
  const started = validArchiveDate(archive.startedAt);
  return started
    ? { date: started, saved: false }
    : {
        date: validArchiveDate(archive.endedAt),
        saved: true,
      };
}

const archiveMonth = new Intl.DateTimeFormat(UI_LOCALE, {
  year: 'numeric',
  month: 'long',
});

export function groupPerformanceArchives(archives) {
  const dated = archives
    .slice()
    .reverse()
    .map((archive) => ({ archive, date: archiveTiming(archive).date }))
    .sort(
      (a, b) =>
        (b.date?.getTime() ?? Number.MIN_SAFE_INTEGER) -
        (a.date?.getTime() ?? Number.MIN_SAFE_INTEGER),
    );
  const groups = new Map();
  for (const { archive, date } of dated) {
    const key = date
      ? `${date.getFullYear()}-${date.getMonth() + 1}`
      : 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: date
          ? archiveMonth.format(date)
          : t('session.archive.unknownMonth'),
        archives: [],
      });
    }
    groups.get(key).archives.push(archive);
  }
  return [...groups.values()];
}

export function performanceArchiveDate(
  value,
  { includeTime = true, includeYear = true } = {},
) {
  const date = validArchiveDate(value);
  if (!date) return '—';
  return date.toLocaleString(UI_LOCALE, {
    ...(includeYear ? { year: 'numeric' } : {}),
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    hour12: false,
  });
}

export function performanceArchiveTiming(archive, { compact = false } = {}) {
  const { date, saved } = archiveTiming(archive);
  if (!date) return '';
  const formatted = performanceArchiveDate(date, { includeYear: !compact });
  return saved && !compact
    ? t('session.archive.archivedAt', { date: formatted })
    : formatted;
}

export function performanceArchiveProgress(completed, performed) {
  return Number.isInteger(performed) && performed !== completed
    ? t('session.archive.progress', { completed, performed })
    : t('session.archive.completedOnly', { completed }, completed);
}

export function performanceArchiveSummary(
  archive,
  { multiline = false, compact = false } = {},
) {
  const timing = performanceArchiveTiming(archive, { compact });
  if (
    !Number.isInteger(archive.completedCount) ||
    (compact && archive.completedCount === 0 && archive.performedCount === 0)
  )
    return timing;
  const progress = performanceArchiveProgress(
    archive.completedCount,
    archive.performedCount,
  );
  if (!timing) return progress;
  return t(
    multiline ? 'session.archive.noteBody' : 'session.archive.noteSummary',
    {
      timing,
      progress,
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

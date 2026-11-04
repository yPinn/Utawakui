import { UI_LOCALE } from './uiLocale.js';
import { t } from './i18n.js';

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

const PROGRESS_LABELS = Object.freeze({
  queued: t('session.archiveStatus.queued'),
  playing: t('session.archiveStatus.playing'),
  completed: t('session.archiveStatus.completed'),
  skipped: t('session.archiveStatus.skipped'),
  interrupted: t('session.archiveStatus.interrupted'),
});
export function performanceArchiveRows(session, tracks) {
  const canonical = new Map(tracks.map((track) => [track.id, track]));
  return (session?.items ?? []).map((item, index) => ({
    key: item.itemId,
    ordinal: index + 1,
    title: item.displayTitle,
    artist: item.displayArtist,
    track: canonical.get(item.trackId) ?? null,
    status: [
      item.mode === 'manual'
        ? t('session.archiveStatus.manualTrack')
        : !canonical.has(item.trackId)
          ? t('session.archiveStatus.noLocalTrack')
          : '',
      PROGRESS_LABELS[item.progress] ?? '',
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}

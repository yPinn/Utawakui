import { UI_LOCALE } from './uiLocale.js';

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
  queued: '未演出',
  playing: '演出中',
  completed: '完成',
  skipped: '略過',
  interrupted: '中止',
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
        ? '手動曲目'
        : !canonical.has(item.trackId)
          ? '無本機曲目'
          : '',
      PROGRESS_LABELS[item.progress] ?? '',
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}

export function formatDuration(seconds, fallback = '--:--') {
  if (!Number.isFinite(seconds)) return fallback;
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = String(total % 60).padStart(2, '0');
  return `${minutes}:${remaining}`;
}

// Always HH:MM:SS, fully zero-padded — deliberately not formatDuration's
// unpadded-leading-unit style. Matches OBS's own outputTimecode convention
// (obs-websocket's "00:12:34.567") and keeps a fixed 8-character width so a
// live-ticking session clock (e.g. the titlebar's OBS LIVE／REC badge) never
// changes digit count as hours roll over. Not for track playback position —
// that stays formatDuration's M:SS.
export function formatElapsedClock(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function formatLongDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} 小時 ${minutes} 分`;
  if (hours) return `${hours} 小時`;
  return `${minutes} 分`;
}

export function formatAddedDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

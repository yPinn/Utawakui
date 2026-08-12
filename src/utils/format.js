export function formatDuration(seconds, fallback = '--:--') {
  if (!Number.isFinite(seconds)) return fallback;
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = String(total % 60).padStart(2, '0');
  return `${minutes}:${remaining}`;
}

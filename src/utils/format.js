export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = String(total % 60).padStart(2, '0');
  return `${minutes}:${remaining}`;
}

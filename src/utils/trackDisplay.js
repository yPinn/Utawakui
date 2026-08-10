export function getTrackInitial(track) {
  const text = String(track?.title || track?.id || '?').trim();
  return (text.slice(0, 1) || '?').toUpperCase();
}

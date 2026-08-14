function isLocalTrack(track) {
  return track?.sourceType === 'local-file';
}

function textKey(value) {
  return String(value || '');
}

function titleKey(track) {
  return String(track?.title || track?.id || '');
}

function compareText(a, b) {
  return textKey(a).localeCompare(textKey(b), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

export function compareSetlistLocalTrackOrder(a, b) {
  const titleDelta = compareText(titleKey(a), titleKey(b));
  if (titleDelta !== 0) return titleDelta;

  return compareText(a?.id, b?.id);
}

export function compareSetlistLibraryTrackOrder(a, b) {
  const artistDelta = compareText(a?.artist, b?.artist);
  if (artistDelta !== 0) return artistDelta;
  const titleDelta = compareText(titleKey(a), titleKey(b));
  if (titleDelta !== 0) return titleDelta;

  return compareText(a?.id, b?.id);
}

export function sortSetlistLocalTracks(tracks) {
  return tracks.filter(isLocalTrack).sort(compareSetlistLocalTrackOrder);
}

export function sortSetlistLibraryTracks(tracks) {
  return tracks
    .filter((track) => !isLocalTrack(track))
    .sort(compareSetlistLibraryTrackOrder);
}

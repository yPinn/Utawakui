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

function importedAtTimestamp(track) {
  const timestamp = Date.parse(track?.importedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareImportedAtNewest(a, b) {
  const aTimestamp = importedAtTimestamp(a);
  const bTimestamp = importedAtTimestamp(b);
  if (aTimestamp === null && bTimestamp === null) return 0;
  if (aTimestamp === null) return 1;
  if (bTimestamp === null) return -1;
  return bTimestamp - aTimestamp;
}

export function compareLocalLibraryTrackOrder(a, b) {
  const importedAtDelta = compareImportedAtNewest(a, b);
  if (importedAtDelta !== 0) return importedAtDelta;
  const titleDelta = compareText(titleKey(a), titleKey(b));
  if (titleDelta !== 0) return titleDelta;

  return compareText(a?.id, b?.id);
}

export function compareLibraryTrackOrder(a, b) {
  const importedAtDelta = compareImportedAtNewest(a, b);
  if (importedAtDelta !== 0) return importedAtDelta;
  const artistDelta = compareText(a?.artist, b?.artist);
  if (artistDelta !== 0) return artistDelta;
  const titleDelta = compareText(titleKey(a), titleKey(b));
  if (titleDelta !== 0) return titleDelta;

  return compareText(a?.id, b?.id);
}

export function sortLocalLibraryTracks(tracks) {
  return tracks.filter(isLocalTrack).sort(compareLocalLibraryTrackOrder);
}

export function sortLibraryTracks(tracks) {
  return [...tracks].sort(compareLibraryTrackOrder);
}

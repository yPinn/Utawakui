export function hasPlayableAccompaniment(track) {
  return Boolean(track?.hasSeparation && track?.stemsUrl);
}

export function toPlayableTrack(track) {
  if (!track) return null;
  return hasPlayableAccompaniment(track)
    ? { ...track, url: track.stemsUrl, usesSeparatedAudio: true }
    : track;
}

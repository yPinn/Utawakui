export function toPlayableTrack(track) {
  if (!track) return null;
  return track.hasSeparation && track.stemsUrl
    ? { ...track, url: track.stemsUrl, usesSeparatedAudio: true }
    : track;
}

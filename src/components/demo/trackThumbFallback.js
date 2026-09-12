import trackThumbFallbackBlue from '../../assets/demo/track-thumb/track-thumb-fallback-blue.png';
import trackThumbFallbackPink from '../../assets/demo/track-thumb/track-thumb-fallback-pink.png';
import trackThumbFallbackRed from '../../assets/demo/track-thumb/track-thumb-fallback-red.png';
import trackThumbFallbackYellow from '../../assets/demo/track-thumb/track-thumb-fallback-yellow.png';

export const TRACK_THUMB_FALLBACK_ARTWORK = Object.freeze([
  { id: 'blue', url: trackThumbFallbackBlue },
  { id: 'pink', url: trackThumbFallbackPink },
  { id: 'red', url: trackThumbFallbackRed },
  { id: 'yellow', url: trackThumbFallbackYellow },
]);

function getTrackIdentity(track) {
  return String(track?.id ?? track?.title ?? '');
}

export function getTrackThumbFallbackArtwork(track) {
  if (!track) return undefined;

  const hash = [...getTrackIdentity(track)].reduce(
    (total, character) => total + character.codePointAt(0),
    0,
  );

  return TRACK_THUMB_FALLBACK_ARTWORK[
    hash % TRACK_THUMB_FALLBACK_ARTWORK.length
  ];
}

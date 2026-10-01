import { toPlayableTrack } from './playableTrack.js';

export function createRecentPlaybackActivation({
  interruptWithTrack,
  playTrack,
}) {
  return async function activateRecentEntry(entry) {
    if (!entry?.track?.id) return false;

    const track = entry.track;
    interruptWithTrack(track);
    await playTrack(toPlayableTrack(track));
    return true;
  };
}

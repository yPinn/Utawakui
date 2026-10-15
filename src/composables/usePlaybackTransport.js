import { usePlayer } from './usePlayer.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { toPlayableTrack } from '../utils/playableTrack.js';

// Previous／next transport actions over the queue, shared by PlayerBar and the
// system media session so a hardware key does exactly what the on-screen button does.
export function usePlaybackTransport() {
  const { playTrack, restartTrack } = usePlayer();
  const { previousTrack, nextTrack } = usePlaybackQueue();

  function playQueuedTrack(track) {
    if (!track) return;
    playTrack(toPlayableTrack(track));
  }

  function playPrevious() {
    const previous = previousTrack();
    if (previous) {
      playQueuedTrack(previous);
      return;
    }

    restartTrack();
  }

  function playNext() {
    playQueuedTrack(nextTrack());
  }

  return { playQueuedTrack, playPrevious, playNext };
}

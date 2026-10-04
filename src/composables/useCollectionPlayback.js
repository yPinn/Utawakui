import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';
import { createCollectionPlaybackController } from '../utils/collectionPlaybackController.js';

export function useCollectionPlayback() {
  const { state: playerState, play, pause, playTrack } = usePlayer();
  const {
    state: queueState,
    setQueue,
    toggleShuffle,
    enqueueTrack,
  } = usePlaybackQueue();

  return createCollectionPlaybackController({
    playerState,
    queueState,
    play,
    pause,
    playTrack,
    setQueue,
    toggleShuffle,
    enqueueTrack,
  });
}

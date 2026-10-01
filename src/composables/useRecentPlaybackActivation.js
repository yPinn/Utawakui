import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';
import { createRecentPlaybackActivation } from '../utils/recentPlaybackActivation.js';

export function useRecentPlaybackActivation() {
  const { interruptWithTrack } = usePlaybackQueue();
  const { playTrack } = usePlayer();

  return {
    activateRecentEntry: createRecentPlaybackActivation({
      interruptWithTrack,
      playTrack,
    }),
  };
}

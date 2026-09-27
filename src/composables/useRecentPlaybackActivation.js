import { useLibrary } from './useLibrary.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';
import { usePlaylists } from './usePlaylists.js';
import { createRecentPlaybackActivation } from '../utils/recentPlaybackActivation.js';

export function useRecentPlaybackActivation() {
  const { tracksById } = useLibrary();
  const { state: playlistState } = usePlaylists();
  const { setQueue, interruptWithTrack } = usePlaybackQueue();
  const { playTrack } = usePlayer();

  return {
    activateRecentEntry: createRecentPlaybackActivation({
      getPlaylists: () => playlistState.playlists,
      getTracksById: () => tracksById.value,
      setQueue,
      interruptWithTrack,
      playTrack,
    }),
  };
}

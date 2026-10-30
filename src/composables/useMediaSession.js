import { onUnmounted, watchEffect } from 'vue';
import { trackArtistText } from '../utils/artistPage.js';
import { useArtistIndex } from './useArtistIndex.js';
import { usePlayer } from './usePlayer.js';
import { usePlaybackTransport } from './usePlaybackTransport.js';

// Mirrors playback to Windows SMTC and claims the hardware media keys, so play,
// pause and track skipping follow the same actions as the on-screen controls.
export function useMediaSession() {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;

  const { state, play, pause } = usePlayer();
  const { playPrevious, playNext } = usePlaybackTransport();
  const { state: artistIndexState } = useArtistIndex();

  watchEffect(() => {
    const track = state.track;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: trackArtistText(track, artistIndexState.index),
          // App icon placeholder until per-track SMTC artwork is wired.
          artwork: [
            {
              src: '/assets/icons/app-icon.png',
              sizes: '1024x1024',
              type: 'image/png',
            },
          ],
        })
      : null;
  });

  watchEffect(() => {
    navigator.mediaSession.playbackState = !state.track
      ? 'none'
      : state.isPlaying
        ? 'playing'
        : 'paused';
  });

  // SMTC card buttons and hardware media keys alike route through the same
  // play()/pause() as every other caller, never touching state.isPlaying directly
  // (see usePlayer.js).
  const actionHandlers = {
    play: () => play(),
    pause: () => pause(),
    previoustrack: () => playPrevious(),
    nexttrack: () => playNext(),
  };
  for (const [action, handler] of Object.entries(actionHandlers)) {
    navigator.mediaSession.setActionHandler(action, handler);
  }

  const clearActionHandlers = () => {
    for (const action of Object.keys(actionHandlers)) {
      navigator.mediaSession.setActionHandler(action, null);
    }
  };

  onUnmounted(clearActionHandlers);

  if (import.meta.hot) {
    import.meta.hot.dispose(clearActionHandlers);
  }
}

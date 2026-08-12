import { onUnmounted, watchEffect } from 'vue';
import { usePlayer } from './usePlayer.js';

// Mirrors playback to Windows SMTC. Hardware media keys stay unclaimed.
export function useMediaSession() {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;

  const { state, play, pause } = usePlayer();

  watchEffect(() => {
    const track = state.track;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artist || '',
          // App icon placeholder until per-track SMTC artwork is wired.
          artwork: [
            {
              src: '/assets/icons/app-icon.png',
              sizes: '1080x1080',
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

  // Screen-drawn buttons on the SMTC card, not hardware keys — these route
  // through the same play()/pause() as every other caller, never touching
  // state.isPlaying directly (see usePlayer.js).
  navigator.mediaSession.setActionHandler('play', () => play());
  navigator.mediaSession.setActionHandler('pause', () => pause());

  const clearActionHandlers = () => {
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
  };

  onUnmounted(clearActionHandlers);

  if (import.meta.hot) {
    import.meta.hot.dispose(clearActionHandlers);
  }
}

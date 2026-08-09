import { watchEffect } from 'vue';
import { usePlayer } from './usePlayer.js';

// Standard Web Media Session API — confirmed working against Windows SMTC
// with zero Chromium command-line flags needed.
//
// Deliberately not wired to hardware media keys: this app may run
// alongside another player (e.g. Spotify for BGM) during a live stream,
// and losing keyboard media-key control to whichever app grabbed it last
// is a real risk mid-broadcast.
export function useMediaSession() {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;

  const { state, play, pause } = usePlayer();

  watchEffect(() => {
    const track = state.track;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artist || '',
          // No per-track artwork exists yet — the app icon is an honest
          // placeholder, not a claim of album art.
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
}

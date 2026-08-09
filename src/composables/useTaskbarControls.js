import { watchEffect } from 'vue';
import { usePlayer } from './usePlayer.js';

// Bridges usePlayer to the Windows taskbar thumbar without coupling
// usePlayer.js itself to Electron — this is the only file that knows IPC
// exists. A thumbar click routes through toggle(), never writing
// state.isPlaying directly (same invariant as every other caller).
export function useTaskbarControls() {
  if (typeof window === 'undefined' || !window.Utawakui) return;

  const { state, toggle } = usePlayer();

  // Tracks only state.isPlaying/state.track — reading nothing else here
  // means frequent fields like currentTime don't trigger a redraw on every
  // timeupdate tick.
  watchEffect(() => {
    window.Utawakui.setPlaybackState({
      isPlaying: state.isPlaying,
      hasTrack: state.track !== null,
    });
  });

  window.Utawakui.onPlayerCommand((command) => {
    if (command === 'toggle') toggle();
  });
}

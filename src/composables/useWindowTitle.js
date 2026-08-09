import { watchEffect } from 'vue';
import { usePlayer } from './usePlayer.js';

const APP_TITLE = 'Utawakui';

// Setting document.title is enough to change the actual OS window title —
// no IPC needed. Electron's BrowserWindow title option is documented to
// defer to the loaded page's <title> tag, which is exactly document.title.
// This is what makes the taskbar thumbnail preview (hover) show the
// current track, matching Spotify's own approach.
export function useWindowTitle() {
  const { state } = usePlayer();

  // Tracks only state.track — reading nothing else here means frequent
  // fields like currentTime don't trigger a DOM write on every timeupdate
  // tick.
  watchEffect(() => {
    const track = state.track;
    if (!track) {
      document.title = APP_TITLE;
      return;
    }
    document.title = track.artist
      ? `${track.title} - ${track.artist}`
      : track.title;
  });
}

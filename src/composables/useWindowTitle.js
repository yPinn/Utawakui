import { watchEffect } from 'vue';
import { trackArtistText } from '../utils/artistPage.js';
import { useArtistIndex } from './useArtistIndex.js';
import { usePlayer } from './usePlayer.js';

import appIdentity from '../../shared/appIdentity.json';

const APP_TITLE = appIdentity.productName;

// Setting document.title is enough to change the actual OS window title —
// no IPC needed. Electron's BrowserWindow title option is documented to
// defer to the loaded page's <title> tag, which is exactly document.title.
// This is what makes the taskbar thumbnail preview (hover) show the
// current track, matching Spotify's own approach.
export function useWindowTitle() {
  const { state } = usePlayer();
  const { state: artistIndexState } = useArtistIndex();

  // Tracks only state.track and the artist index — reading nothing else here
  // means frequent fields like currentTime don't trigger a DOM write on every
  // timeupdate tick.
  watchEffect(() => {
    const track = state.track;
    if (!track) {
      document.title = APP_TITLE;
      return;
    }
    const artist = trackArtistText(track, artistIndexState.index);
    document.title = artist ? `${track.title} - ${artist}` : track.title;
  });
}

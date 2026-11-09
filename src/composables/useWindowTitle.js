import { watchEffect } from 'vue';
import { trackArtistText } from '../utils/artistPage.js';
import { trackDisplayTitle } from '../utils/trackTitlePresentation.js';
import { useArtistIndex } from './useArtistIndex.js';
import { useLibrary } from './useLibrary.js';
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
  const { tracksById } = useLibrary();

  // The title updates with library presentation, independent of playback ticks.
  watchEffect(() => {
    const track = state.track;
    if (!track) {
      document.title = APP_TITLE;
      return;
    }
    const title = trackDisplayTitle(track, tracksById.value);
    const artist = trackArtistText(track, artistIndexState.index);
    document.title = artist ? `${title} - ${artist}` : title;
  });
}

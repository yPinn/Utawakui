import { createAudioPreferencesPersistence } from './useAudioPreferencesPersistence.js';
import { usePlayer } from './usePlayer.js';

export { createAudioPreferencesPersistence };

const { state: playerState } = usePlayer();
const persistence = createAudioPreferencesPersistence({
  playerState,
  bridge:
    typeof window !== 'undefined' && window.Utawakui ? window.Utawakui : null,
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void persistence.dispose();
  });
}

export function useAudioPreferences() {
  return persistence;
}

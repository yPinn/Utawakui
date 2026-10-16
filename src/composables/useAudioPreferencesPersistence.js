import { reactive, readonly, watch } from 'vue';
import { projectAudioPreferences } from '../utils/audioPreferences.js';

const DEFAULT_SAVE_DELAY_MS = 200;

export function createAudioPreferencesPersistence({
  playerState,
  bridge,
  saveDelayMs = DEFAULT_SAVE_DELAY_MS,
}) {
  const state = reactive({ error: null });
  let stopWatch = null;
  let saveTimer = null;
  let dirty = false;
  let writeChain = Promise.resolve();

  function currentPreferences() {
    return projectAudioPreferences(playerState);
  }

  function persistNow() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!dirty || typeof bridge?.setAudioPreferences !== 'function') {
      return writeChain;
    }
    dirty = false;
    const preferences = currentPreferences();
    writeChain = writeChain
      .catch(() => undefined)
      .then(() => bridge.setAudioPreferences(preferences))
      .then(
        () => {
          state.error = null;
        },
        () => {
          state.error = '音量設定暫時無法保存。';
        },
      );
    return writeChain;
  }

  function schedulePersist() {
    dirty = true;
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistNow();
    }, saveDelayMs);
  }

  function initialize() {
    stopWatch ??= watch(
      () => [
        playerState.volume,
        playerState.isMuted,
        playerState.guideVocalValue,
        playerState.captureGuideVocalValue,
      ],
      schedulePersist,
    );
  }

  async function dispose() {
    stopWatch?.();
    stopWatch = null;
    await persistNow();
  }

  return {
    state: readonly(state),
    initialize,
    persistNow,
    dispose,
  };
}

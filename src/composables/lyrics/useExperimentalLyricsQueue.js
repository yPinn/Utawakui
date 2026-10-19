import { readonly, shallowRef } from 'vue';
const state = shallowRef(null),
  error = shallowRef(''),
  revision = shallowRef(0);
let read = 0;
export function useExperimentalLyricsQueue() {
  async function refresh() {
    const current = ++read;
    try {
      const value = await window.Utawakui?.getExperimentalLyricsStatus();
      if (current === read) state.value = value ?? null;
    } catch {
      error.value = '無法讀取詞塊分析狀態，請重試。';
    }
  }
  async function action(name, value) {
    error.value = '';
    ++read;
    try {
      await window.Utawakui[
        `${name}ExperimentalLyrics${name === 'set' ? 'Enabled' : ''}`
      ](value);
      revision.value++;
    } catch {
      error.value = '操作未完成，伴奏與原有歌詞仍可使用。';
    }
    await refresh();
  }
  return {
    state: readonly(state),
    error: readonly(error),
    revision: readonly(revision),
    refresh,
    setEnabled: (value) => action('set', value),
    cancel: (trackId) => action('cancel', trackId),
    retry: (trackId) => action('retry', trackId),
  };
}

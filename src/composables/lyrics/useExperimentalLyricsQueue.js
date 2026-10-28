import { computed, readonly, shallowRef } from 'vue';
const state = shallowRef(null),
  readError = shallowRef(''),
  operationError = shallowRef(''),
  revision = shallowRef(0),
  completions = shallowRef([]);
let read = 0;
const error = computed(() => operationError.value || readError.value);
let completionBridge, unsubscribeCompletion;
export function useExperimentalLyricsQueue() {
  async function refresh() {
    const current = ++read;
    try {
      const value = await window.Utawakui?.getExperimentalLyricsStatus();
      if (current === read) {
        const completed = (value?.items ?? []).filter(
          (item) =>
            item.status === 'ready' &&
            !state.value?.items?.some(
              (previous) =>
                previous.jobId === item.jobId && previous.status === 'ready',
            ),
        );
        state.value = value ?? null;
        readError.value = '';
        if (completed.length) {
          completions.value = completed;
          revision.value++;
        }
      }
    } catch {
      if (current === read)
        readError.value = '無法讀取詞塊分析狀態，請再試一次。';
    }
  }
  async function action(name, value, ...extra) {
    operationError.value = '';
    ++read;
    try {
      const result = await window.Utawakui[
        `${name}ExperimentalLyrics${name === 'set' ? 'Enabled' : ''}`
      ](value, ...extra);
      if (name === 'retry' && result?.queued === false)
        throw Error('analysis not queued');
    } catch {
      operationError.value = '操作未完成，伴奏與原有歌詞仍可使用。';
    }
    await refresh();
  }
  const bridge = globalThis.window?.Utawakui;
  if (bridge?.onExperimentalLyricsCompleted && bridge !== completionBridge) {
    unsubscribeCompletion?.();
    completionBridge = bridge;
    unsubscribeCompletion = bridge.onExperimentalLyricsCompleted(() => {
      void refresh();
    });
  }
  return {
    state: readonly(state),
    error: readonly(error),
    readError: readonly(readError),
    revision: readonly(revision),
    completions: readonly(completions),
    refresh,
    setEnabled: (value) => action('set', value),
    cancel: (trackId, ...job) => action('cancel', trackId, ...job),
    retry: (trackId, ...language) => action('retry', trackId, ...language),
  };
}
if (import.meta.hot) import.meta.hot.dispose(() => unsubscribeCompletion?.());

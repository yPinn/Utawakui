import { computed, readonly, shallowRef } from 'vue';
export function createLyricsResearchOwner(getBridge) {
  const status = shallowRef(null),
    working = shallowRef(false),
    error = shallowRef(''),
    preview = shallowRef(null),
    inspection = shallowRef(null);
  let readRevision = 0,
    selectionRevision = 0;
  const busy = computed(() => working.value || status.value?.busy === true);
  function clearPreview() {
    preview.value = null;
    ++selectionRevision;
  }
  async function refresh() {
    const revision = ++readRevision;
    try {
      const result = await getBridge()?.getLyricsResearchStatus();
      if (!result?.researchOnly || typeof result.status !== 'string')
        throw Error('unavailable');
      if (revision === readRevision) status.value = result;
    } catch {
      if (revision === readRevision)
        error.value = '目前無法讀取研究環境，請重新啟動 App 或重試。';
    }
  }
  async function inspect(intent) {
    clearPreview();
    inspection.value = null;
    error.value = '';
    const revision = selectionRevision;
    if (!intent.trackId) return;
    try {
      const result = await getBridge().inspectLyricsResearch(intent);
      if (revision === selectionRevision) inspection.value = result;
    } catch {
      if (revision === selectionRevision)
        error.value =
          '無法讀取這首歌的時間歌詞，請先確認曲庫、歌詞來源與曲長。';
    }
  }
  async function action(name, intent) {
    if (busy.value) return;
    working.value = true;
    error.value = '';
    clearPreview();
    ++readRevision;
    const revision = selectionRevision;
    try {
      const bridge = getBridge();
      const result = await bridge[`${name}LyricsResearch`](
        ...(intent ? [intent] : []),
      );
      if (result?.cancelled) error.value = '已取消研究操作，原有歌詞仍可使用。';
      else if (name === 'preview' && revision === selectionRevision)
        preview.value = result;
    } catch {
      error.value =
        '研究操作未完成。請先準備 FFmpeg，或重新下載修復研究環境；原有歌詞仍可使用。';
    } finally {
      working.value = false;
      await refresh();
    }
  }
  async function cancel() {
    clearPreview();
    try {
      await getBridge()?.cancelLyricsResearch();
      await refresh();
    } catch {
      error.value = '取消尚未完成，請重新讀取狀態。';
    }
  }
  return {
    status: readonly(status),
    busy,
    error: readonly(error),
    preview: readonly(preview),
    inspection: readonly(inspection),
    refresh,
    inspect,
    action,
    cancel,
    clearPreview,
  };
}
let owner;
export function useLyricsResearch() {
  return (owner ??= createLyricsResearchOwner(() =>
    typeof window === 'undefined' ? null : window.Utawakui,
  ));
}

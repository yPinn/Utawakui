import { onScopeDispose, readonly, shallowRef, toValue, watch } from 'vue';
import { useAppNotifications } from '../useAppNotifications.js';

export function useLyricsWaveform({
  trackId,
  sourceKey,
  api = globalThis.window?.Utawakui,
  notify = useAppNotifications().notify,
}) {
  const open = shallowRef(false),
    overview = shallowRef(null),
    detail = shallowRef(null),
    status = shallowRef('idle'),
    tileIndex = shallowRef(0);
  const clearing = shallowRef(false);
  const pending = new Set();
  let serial = 0,
    disposed = false;
  let cancellation = Promise.resolve();
  const reportFailure = () =>
    notify({
      key: 'lyrics-waveform',
      tone: 'danger',
      title: '波形操作未完成',
      message: '請稍後重新嘗試；歌詞與已保存的對時不受影響。',
    });
  async function cancelPending() {
    const ids = [...pending];
    pending.clear();
    cancellation = cancellation.then(() =>
      Promise.allSettled(ids.map((id) => api?.cancelWaveform?.(id))),
    );
    await cancellation;
  }
  function close() {
    serial++;
    open.value = false;
    overview.value = detail.value = null;
    status.value = 'idle';
    clearing.value = false;
    return cancelPending();
  }
  async function load(kind, tile = 0) {
    const id = ++serial,
      track = toValue(trackId),
      source = toValue(sourceKey);
    await cancelPending();
    const current = () =>
      !disposed &&
      open.value &&
      id === serial &&
      track === toValue(trackId) &&
      source === toValue(sourceKey);
    if (!current() || !track) return false;
    const requestId = globalThis.crypto.randomUUID();
    pending.add(requestId);
    status.value = 'loading';
    if (kind === 'detail') {
      tileIndex.value = tile;
      detail.value = null;
    }
    try {
      const result = await api?.readWaveform?.({
        trackId: track,
        requestId,
        kind,
        tileIndex: tile,
      });
      if (!current()) return false;
      status.value = result?.status ?? 'unavailable';
      if (result?.status === 'ready') {
        (kind === 'overview' ? overview : detail).value = result.summary;
        return true;
      }
      if (['unavailable', 'timeout'].includes(status.value))
        notify({
          key: 'lyrics-waveform',
          tone: 'danger',
          title: '波形無法讀取',
          message: '請稍後重新讀取；歌詞與已保存的對時不受影響。',
        });
    } catch {
      if (current()) {
        status.value = 'unavailable';
        notify({
          key: 'lyrics-waveform',
          tone: 'danger',
          title: '波形無法讀取',
          message: '請稍後重新讀取。',
        });
      }
    } finally {
      pending.delete(requestId);
    }
    return false;
  }
  async function reload() {
    if (clearing.value) return;
    overview.value = detail.value = null;
    tileIndex.value = 0;
    if (await load('overview')) await load('detail');
  }
  async function setOpen(value) {
    if (!value) return close();
    if (!toValue(trackId) || disposed) return;
    open.value = true;
    await reload();
  }
  async function clear() {
    if (clearing.value) return;
    clearing.value = true;
    const track = toValue(trackId),
      id = ++serial;
    overview.value = detail.value = null;
    status.value = 'loading';
    await cancelPending();
    if (disposed || id !== serial) {
      clearing.value = false;
      return;
    }
    try {
      const result = await api?.clearWaveform?.(track);
      if (id === serial && !disposed)
        status.value = result?.status === 'done' ? 'idle' : 'unavailable';
      if (id === serial && !disposed && status.value === 'unavailable')
        reportFailure();
    } catch {
      if (id === serial && !disposed) {
        status.value = 'unavailable';
        reportFailure();
      }
    } finally {
      if (id === serial) clearing.value = false;
    }
  }
  watch(
    () => [toValue(trackId), toValue(sourceKey)],
    () => {
      void close();
    },
    { flush: 'sync' },
  );
  const unsubscribe = api?.onLibraryUpdated?.(() => {
    void close();
  });
  onScopeDispose(() => {
    disposed = true;
    void close();
    unsubscribe?.();
  });
  return {
    open: readonly(open),
    overview: readonly(overview),
    detail: readonly(detail),
    status: readonly(status),
    tileIndex: readonly(tileIndex),
    clearing: readonly(clearing),
    setOpen,
    reload,
    clear,
    selectTile: (tile) => load('detail', tile),
  };
}

import { onScopeDispose, readonly, shallowRef, toValue, watch } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
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
    adjacentDetail = shallowRef(null),
    status = shallowRef('idle'),
    tileIndex = shallowRef(0);
  const clearing = shallowRef(false);
  const pending = new Set();
  let serial = 0,
    disposed = false,
    windowRevision = 0,
    lastTile = 0,
    adjacentTile = null,
    mediaRevision = null,
    visibleFirst = 0,
    allowPrefetch = false,
    prefetchJob = null,
    detailJob = null;
  let cancellation = Promise.resolve();
  const reportFailure = () =>
    notify({
      key: NOTIFICATION_KEYS.LYRICS_WAVEFORM,
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
    windowRevision++;
    open.value = false;
    overview.value = detail.value = adjacentDetail.value = null;
    mediaRevision = null;
    status.value = 'idle';
    clearing.value = false;
    allowPrefetch = false;
    prefetchJob = null;
    detailJob = null;
    return cancelPending();
  }
  function invalidate(statusCode) {
    serial++;
    windowRevision++;
    overview.value = detail.value = adjacentDetail.value = null;
    mediaRevision = null;
    allowPrefetch = false;
    prefetchJob = null;
    detailJob = null;
    status.value = statusCode;
  }
  async function cancelPrefetch() {
    allowPrefetch = false;
    const job = prefetchJob;
    if (!job || (job.tile >= visibleFirst && job.tile <= lastTile)) return;
    prefetchJob = null;
    if (detailJob === job) detailJob = null;
    serial++;
    await cancelPending();
  }
  function startPrefetch() {
    const next = visibleFirst + 1;
    if (
      !allowPrefetch ||
      prefetchJob ||
      lastTile !== visibleFirst ||
      next * 10 >= (overview.value?.durationSec ?? 0)
    )
      return;
    if (adjacentTile === next && adjacentDetail.value) return;
    adjacentTile = next;
    adjacentDetail.value = null;
    startDetail(next, true, true);
  }
  function startDetail(tile, adjacent = false, speculative = false) {
    const job = { tile, promise: null };
    detailJob = job;
    if (speculative) prefetchJob = job;
    job.promise = load('detail', tile, adjacent, speculative).finally(() => {
      if (detailJob === job) detailJob = null;
      if (prefetchJob === job) prefetchJob = null;
    });
    return job.promise;
  }
  async function load(kind, tile = 0, adjacent = false, speculative = false) {
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
    if (!speculative) status.value = 'loading';
    if (kind === 'detail') {
      if (adjacent) {
        adjacentTile = tile;
        adjacentDetail.value = null;
      } else {
        tileIndex.value = tile;
        detail.value = null;
      }
    }
    try {
      const result = await api?.readWaveform?.({
        trackId: track,
        requestId,
        kind,
        tileIndex: tile,
      });
      if (!current()) return false;
      const code = result?.status ?? 'unavailable';
      if (
        [
          'source-stale',
          'invalid-intent',
          'unsupported',
          'gate-disabled',
          'decoder-unavailable',
        ].includes(code)
      ) {
        invalidate(code === 'invalid-intent' ? 'source-stale' : code);
        return false;
      }
      if (!speculative) status.value = code;
      if (result?.status === 'ready') {
        if (
          typeof result.mediaRevision !== 'string' ||
          !/^[a-f0-9]{64}$/.test(result.mediaRevision)
        ) {
          invalidate('source-stale');
          return false;
        }
        if (kind === 'overview') mediaRevision = result.mediaRevision;
        else if (result.mediaRevision !== mediaRevision) {
          invalidate('source-stale');
          return false;
        }
        (kind === 'overview'
          ? overview
          : adjacent
            ? adjacentDetail
            : detail
        ).value = result.summary;
        return true;
      }
      if (!speculative && ['unavailable', 'timeout'].includes(status.value))
        notify({
          key: NOTIFICATION_KEYS.LYRICS_WAVEFORM,
          tone: 'danger',
          title: '波形無法讀取',
          message: '請稍後重新讀取；歌詞與已保存的對時不受影響。',
        });
    } catch {
      if (current() && !speculative) {
        status.value = 'unavailable';
        notify({
          key: NOTIFICATION_KEYS.LYRICS_WAVEFORM,
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
  async function selectWindow(
    first,
    last = first,
    { prefetchNext = false } = {},
  ) {
    const max = Math.ceil((overview.value?.durationSec ?? 0) / 10) - 1;
    if (
      !open.value ||
      disposed ||
      clearing.value ||
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      first < 0 ||
      last < first ||
      last > max ||
      last - first > 1
    )
      return false;
    const revision = ++windowRevision;
    visibleFirst = first;
    lastTile = last;
    allowPrefetch = prefetchNext;
    const current = () =>
      open.value && !disposed && revision === windowRevision;
    // Promote the exact in-flight read instead of cancelling at its boundary.
    const joining = detailJob;
    if (joining && joining.tile >= first && joining.tile <= last) {
      status.value = 'loading';
      await joining.promise;
      if (!current()) return false;
    }
    prefetchJob = null;
    detailJob = null;
    serial++;
    await cancelPending();
    if (!current()) return false;
    const resident = [
      { tile: tileIndex.value, summary: detail.value },
      { tile: adjacentTile, summary: adjacentDetail.value },
    ];
    detail.value =
      resident.find((value) => value.tile === first)?.summary ?? null;
    adjacentDetail.value =
      last === first
        ? null
        : (resident.find((value) => value.tile === last)?.summary ?? null);
    tileIndex.value = first;
    lastTile = last;
    adjacentTile = last === first ? null : last;
    if (!detail.value && !(await startDetail(first))) return false;
    if (!current()) return false;
    if (
      last !== first &&
      !adjacentDetail.value &&
      !(await startDetail(last, true))
    )
      return false;
    if (!current()) return false;
    status.value = 'ready';
    startPrefetch();
    return true;
  }
  async function reload(preserveTile = false) {
    if (clearing.value) return;
    windowRevision++;
    const tile = preserveTile ? visibleFirst : 0;
    const last = preserveTile ? lastTile : tile;
    prefetchJob = null;
    detailJob = null;
    overview.value = detail.value = adjacentDetail.value = null;
    if (!preserveTile) tileIndex.value = 0;
    const reading = load('overview'),
      revision = serial;
    if ((await reading) && revision === serial && overview.value)
      await selectWindow(
        Math.min(
          tile,
          Math.max(0, Math.ceil(overview.value.durationSec / 10) - 1),
        ),
        Math.min(
          last,
          Math.max(0, Math.ceil(overview.value.durationSec / 10) - 1),
        ),
        { prefetchNext: allowPrefetch },
      );
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
    allowPrefetch = false;
    prefetchJob = null;
    detailJob = null;
    windowRevision++;
    const track = toValue(trackId),
      id = ++serial;
    overview.value = detail.value = adjacentDetail.value = null;
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
    if (
      !open.value ||
      clearing.value ||
      (!overview.value && !detail.value && status.value !== 'loading')
    )
      return;
    // Revalidate only the open reference view; never revive an explicitly cleared cache.
    void reload(true);
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
    adjacentDetail: readonly(adjacentDetail),
    status: readonly(status),
    tileIndex: readonly(tileIndex),
    clearing: readonly(clearing),
    setOpen,
    reload: () => reload(true),
    clear,
    cancelPrefetch,
    selectWindow,
    selectTile: (tile) => selectWindow(tile),
  };
}

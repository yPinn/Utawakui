import { reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import { useAppNotifications } from './useAppNotifications.js';

const keyOf = (collection) =>
  JSON.stringify([collection.releaseLibraryEpoch, collection.id]);
const counts = [
  'batchId',
  'total',
  'completed',
  'succeeded',
  'failed',
  'unlinked',
  'skipped',
  'cancelled',
  'downloadableCount',
];
function validSnapshot(value, input) {
  return (
    value?.collectionId === input.collectionId &&
    value.libraryEpoch === input.libraryEpoch &&
    typeof value.active === 'boolean' &&
    ['idle', 'running', 'stopping', 'complete', 'stopped'].includes(
      value.phase,
    ) &&
    counts.every(
      (field) =>
        Number.isSafeInteger(value[field]) &&
        value[field] >= 0 &&
        (field === 'batchId' || value[field] <= 5000),
    ) &&
    Array.isArray(value.pendingSlots) &&
    value.pendingSlots.length <= 5000 &&
    value.pendingSlots.every((key) => /^slot-[1-9][0-9]{0,3}$/.test(key))
  );
}
export function createReleaseCatalogBatchDownloads({
  bridge,
  requireFeatureGate,
  refresh,
  notify = () => {},
}) {
  const state = reactive({
    snapshots: new Map(),
    busy: new Set(),
    errors: new Map(),
  });
  const timers = new Map(),
    versions = new Map(),
    flights = new Map(),
    reported = new Set(),
    retries = new Map();
  let disposed = false;
  function clearTimer(key) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }
  function schedule(collection, delay = 500) {
    const key = keyOf(collection);
    clearTimer(key);
    if (!disposed)
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void perform(collection, 'status');
        }, delay),
      );
  }
  function perform(collection, operation) {
    if (disposed) return Promise.resolve(false);
    const key = keyOf(collection),
      flightKey = JSON.stringify([
        key,
        operation,
        collection.resolvedRelease?.revision,
      ]);
    if (flights.has(flightKey)) return flights.get(flightKey);
    const version = (versions.get(key) ?? 0) + 1;
    versions.set(key, version);
    const input = {
      operation,
      collectionId: collection.id,
      libraryEpoch: collection.releaseLibraryEpoch,
      expectedRevision: collection.resolvedRelease?.revision ?? 0,
    };
    const captured = {
      id: input.collectionId,
      releaseLibraryEpoch: input.libraryEpoch,
      resolvedRelease: { revision: input.expectedRevision },
    };
    state.busy.add(key);
    clearTimer(key);
    const task = Promise.resolve()
      .then(async () => {
        if (
          ['start', 'retry'].includes(operation) &&
          !(await requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
            source: 'library',
            operation: 'download-release-batch',
            message: '啟用外部來源後，即可下載專輯尚未持有的曲目。',
          }))
        )
          return false;
        if (disposed || versions.get(key) !== version) return false;
        const result = await bridge.releaseCatalogDownloadBatch(input);
        if (disposed || versions.get(key) !== version) return false;
        if (result?.status !== 'ok' || !validSnapshot(result.snapshot, input))
          throw Error('Batch unavailable');
        const snapshot = result.snapshot;
        state.snapshots.set(key, snapshot);
        state.errors.delete(key);
        retries.delete(key);
        if (snapshot.active) schedule(captured);
        else if (
          snapshot.batchId &&
          ['complete', 'stopped'].includes(snapshot.phase)
        ) {
          const receipt = JSON.stringify([key, snapshot.batchId]);
          if (!reported.has(receipt)) {
            reported.add(receipt);
            if (reported.size > 128)
              reported.delete(reported.values().next().value);
            let refreshFailed = false;
            try {
              await refresh();
            } catch {
              refreshFailed = true;
            }
            if (disposed) return true;
            const problems = snapshot.failed + snapshot.unlinked;
            const message = `${snapshot.succeeded} 首完成${problems ? `，${problems} 首待重試或校對` : ''}${snapshot.cancelled ? `，${snapshot.cancelled} 首已停止排隊` : ''}${snapshot.skipped ? `，${snapshot.skipped} 首已在其他下載中` : ''}${refreshFailed ? '；畫面更新失敗，請重新讀取。' : ''}`;
            notify({
              key: `release-batch-${receipt}`,
              title:
                snapshot.phase === 'stopped'
                  ? '專輯下載已停止排隊'
                  : '專輯下載完成',
              message,
              tone: problems || refreshFailed ? 'warning' : 'success',
            });
          }
        }
        return true;
      })
      .catch(() => {
        if (disposed || versions.get(key) !== version) return false;
        state.errors.set(key, '專輯下載狀態未完成，請重新讀取後再試。');
        const attempts = (retries.get(key) ?? 0) + 1;
        retries.set(key, attempts);
        if (state.snapshots.get(key)?.active && attempts <= 3)
          schedule(captured, 500 * attempts);
        return false;
      })
      .finally(() => {
        flights.delete(flightKey);
        if (versions.get(key) === version) state.busy.delete(key);
      });
    flights.set(flightKey, task);
    return task;
  }
  return {
    state: readonly(state),
    snapshotFor: (collection) => state.snapshots.get(keyOf(collection)) ?? null,
    errorFor: (collection) => state.errors.get(keyOf(collection)) ?? '',
    busyFor: (collection) => state.busy.has(keyOf(collection)),
    inspect: (collection) => perform(collection, 'status'),
    start: (collection) => perform(collection, 'start'),
    stop: (collection) => perform(collection, 'stop'),
    retry: (collection) => perform(collection, 'retry'),
    dispose() {
      disposed = true;
      for (const key of timers.keys()) clearTimer(key);
    },
  };
}
const sessions = new WeakMap(),
  active = new Set(),
  unavailable = {};
export function useReleaseCatalogBatchDownloads() {
  const bridge = globalThis.window?.Utawakui ?? unavailable;
  if (!sessions.has(bridge)) {
    const session = createReleaseCatalogBatchDownloads({
      bridge,
      requireFeatureGate: useFeatureGateAccess().requireFeatureGate,
      refresh: async () => {
        const library = useLibrary(),
          playlists = usePlaylists();
        await Promise.all([
          library.refresh({ allowProviderBackfill: false }),
          playlists.refresh(),
        ]);
        if (library.state.error || playlists.state.error)
          throw Error('Refresh unavailable');
      },
      notify: useAppNotifications().notify,
    });
    sessions.set(bridge, session);
    active.add(session);
  }
  return sessions.get(bridge);
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const session of active) session.dispose();
    active.clear();
  });

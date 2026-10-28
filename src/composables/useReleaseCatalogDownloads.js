import { reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import { useAppNotifications } from './useAppNotifications.js';
import { notificationKey } from '../constants/notificationKeys.js';

const sessions = new WeakMap();
const unavailable = {};
const scopeKey = (collection) =>
  JSON.stringify([collection.releaseLibraryEpoch, collection.id]);
const jobKey = (collection, row) =>
  JSON.stringify([scopeKey(collection), row.key]);

export function createReleaseCatalogDownloads({
  bridge,
  requireFeatureGate,
  refresh,
  notify = () => {},
  notifyFailure = (notice) => notify({ tone: 'danger', ...notice }),
  clearNotice = () => {},
}) {
  const state = reactive({ pending: new Map(), errors: new Map() });
  const requests = new Map();
  function download(collection, row) {
    const key = jobKey(collection, row);
    if (requests.has(key)) return requests.get(key);
    const scope = scopeKey(collection);
    // Successes share one album slot so a run of row downloads cannot fill
    // the shelf; a row's own problem stays until that row succeeds.
    const albumNotice = notificationKey.releaseDownload(scope);
    const trackNotice = notificationKey.releaseTrack(key);
    const input = {
      collectionId: collection.id,
      expectedRevision: collection.resolvedRelease.revision,
      libraryEpoch: collection.releaseLibraryEpoch,
      slotKey: row.key,
    };
    const local = Boolean(row.localCandidateTrackId);
    state.pending.set(key, { scope, slotKey: row.key });
    state.errors.delete(scope);
    const task = Promise.resolve()
      .then(async () => {
        try {
          if (
            !local &&
            !(await requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
              source: 'library',
              operation: 'download-release-track',
              message: '啟用外部來源後，即可下載這首專輯曲目。',
            }))
          )
            return false;
          const result = await (local
            ? bridge.linkLocalReleaseCatalogTrack(input)
            : bridge.downloadReleaseCatalogTrack(input));
          if (!['ok', 'downloaded-unlinked'].includes(result?.status))
            throw Error('Unavailable');
          let refreshFailed = false;
          try {
            await refresh();
          } catch {
            refreshFailed = true;
          }
          if (result.status !== 'ok') {
            const message = '音檔已下載，專輯關聯尚未更新，請重新讀取後校對。';
            state.errors.set(scope, message);
            notify({
              key: trackNotice,
              title: '曲目已下載',
              message,
              tone: 'warning',
            });
            return false;
          }
          if (refreshFailed) {
            const message = '曲目已納入專輯，畫面更新失敗，請重新讀取。';
            state.errors.set(scope, message);
            notify({
              key: trackNotice,
              title: local ? '已納入專輯' : '下載完成',
              message,
              tone: 'warning',
            });
            return true;
          }
          clearNotice(trackNotice);
          notify({
            key: albumNotice,
            title: local ? '已納入專輯' : '下載完成',
            message: row.title || '來源未提供曲名',
            tone: 'success',
          });
          return true;
        } catch (error) {
          state.errors.set(
            scope,
            local
              ? '目前無法納入本地曲目，請重新讀取後再試。'
              : '曲目下載未完成，請確認外部來源工具後再試。',
          );
          notifyFailure({
            key: trackNotice,
            title: local ? '專輯關聯未更新' : '下載未完成',
            message: local
              ? '請重新讀取後再試。'
              : '請確認外部來源工具後再試。',
            error,
            code: local
              ? 'RELEASE_TRACK_LINK_FAILED'
              : 'RELEASE_TRACK_DOWNLOAD_FAILED',
            source: 'library',
            operation: local ? 'link-release-track' : 'download-release-track',
            context: { retryable: true },
          });
          return false;
        }
      })
      .finally(() => {
        state.pending.delete(key);
        requests.delete(key);
      });
    requests.set(key, task);
    return task;
  }
  return {
    state: readonly(state),
    download,
    pendingSlots: (collection) =>
      new Set(
        [...state.pending.values()]
          .filter((job) => job.scope === scopeKey(collection))
          .map((job) => job.slotKey),
      ),
    errorFor: (collection) => state.errors.get(scopeKey(collection)) || '',
  };
}

export function useReleaseCatalogDownloads() {
  const bridge = globalThis.window?.Utawakui ?? unavailable;
  if (!sessions.has(bridge))
    sessions.set(
      bridge,
      createReleaseCatalogDownloads({
        bridge,
        requireFeatureGate: useFeatureGateAccess().requireFeatureGate,
        refresh: async () => {
          const library = useLibrary();
          const playlists = usePlaylists();
          await Promise.all([
            library.refresh({ allowProviderBackfill: false }),
            playlists.refresh(),
          ]);
          if (library.state.error || playlists.state.error)
            throw Error('Refresh unavailable');
        },
        notify: useAppNotifications().notify,
        notifyFailure: useAppNotifications().notifyFailure,
        clearNotice: useAppNotifications().clear,
      }),
    );
  return sessions.get(bridge);
}

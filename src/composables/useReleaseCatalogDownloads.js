import { reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import { useAppNotifications } from './useAppNotifications.js';
import { notificationKey } from '../constants/notificationKeys.js';
import { t } from '../utils/i18n.js';

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
              message: t('release.download.needsProvider'),
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
            const message = t('release.download.linkPending');
            state.errors.set(scope, message);
            notify({
              key: trackNotice,
              title: t('release.download.downloadedTitle'),
              message,
              tone: 'warning',
            });
            return false;
          }
          if (refreshFailed) {
            const message = t('release.download.refreshFailed');
            state.errors.set(scope, message);
            notify({
              key: trackNotice,
              title: local
                ? t('release.download.includedTitle')
                : t('release.download.doneTitle'),
              message,
              tone: 'warning',
            });
            return true;
          }
          clearNotice(trackNotice);
          notify({
            key: albumNotice,
            title: local
              ? t('release.download.includedTitle')
              : t('release.download.doneTitle'),
            message: row.title || t('release.download.untitled'),
            tone: 'success',
          });
          return true;
        } catch (error) {
          state.errors.set(
            scope,
            local
              ? t('release.download.includeFailed')
              : t('release.download.downloadFailed'),
          );
          notifyFailure({
            key: trackNotice,
            title: local
              ? t('release.download.linkFailedTitle')
              : t('release.download.failedTitle'),
            message: local
              ? t('release.download.reloadRetry')
              : t('release.download.checkTool'),
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

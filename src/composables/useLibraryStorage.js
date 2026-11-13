import { computed, reactive, shallowRef } from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import storageValues from '../../shared/libraryStorageValues.json';
import { useAppNotifications } from './useAppNotifications.js';
import { formatBytes } from '../utils/format.js';
import { t } from '../utils/i18n.js';

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

function defaultPolicy() {
  return {
    autoManageSeparation: storageValues.defaultAutoManageSeparation,
    separationLimitBytes: storageValues.defaultSeparationLimitBytes,
  };
}

const sessions = new WeakMap();
const unavailableBridge = {};

function createStorageSession(bridge) {
  const notifications = useAppNotifications();
  const snapshot = shallowRef(null);
  const state = reactive({
    loading: false,
    saving: false,
    cleaning: '',
    readError: '',
    saveError: '',
  });
  let unsubscribeLibraryUpdated = null;
  const consumers = new Set();
  let revision = 0;

  function applySnapshot(nextSnapshot) {
    if (!nextSnapshot?.storage || !nextSnapshot?.policy)
      throw new TypeError('invalid storage snapshot');
    snapshot.value = nextSnapshot;
  }

  async function refresh() {
    if (state.saving || state.cleaning) return false;
    const current = ++revision;
    if (typeof bridge?.getLibraryStorage !== 'function') {
      state.readError = t('librarySettings.storage.readFailed');
      return false;
    }

    state.loading = true;
    try {
      const next = await bridge.getLibraryStorage();
      if (current !== revision) return false;
      applySnapshot(next);
      state.readError = '';
      return true;
    } catch {
      if (current !== revision) return false;
      state.readError = t('librarySettings.storage.readFailed');
      return false;
    } finally {
      if (current === revision) state.loading = false;
    }
  }

  async function initialize(consumer) {
    consumers.add(consumer);
    if (
      !unsubscribeLibraryUpdated &&
      typeof bridge?.onLibraryUpdated === 'function'
    ) {
      unsubscribeLibraryUpdated = bridge.onLibraryUpdated(() => {
        void refresh();
      });
    }
    return refresh();
  }

  async function setPolicy(policy) {
    if (state.saving || state.cleaning) {
      return false;
    }

    ++revision;
    state.loading = false;
    state.saving = true;

    try {
      applySnapshot(await bridge.setLibraryStoragePolicy(policy));
      state.saveError = '';
      state.readError = '';
      return true;
    } catch {
      state.saveError = t('librarySettings.storage.saveFailed');
      return false;
    } finally {
      state.saving = false;
    }
  }

  async function cleanup(kind = 'separation') {
    if (state.cleaning || state.saving) {
      return false;
    }

    ++revision;
    state.loading = false;
    state.cleaning = kind;
    const videos = kind === 'videos';
    const key = videos
      ? NOTIFICATION_KEYS.LIBRARY_VIDEO_CLEANUP
      : NOTIFICATION_KEYS.LIBRARY_CLEANUP;
    try {
      const result = await (videos
        ? bridge.cleanupLibraryVideos()
        : bridge.cleanupLibraryStorage());
      applySnapshot(result);
      state.readError = '';
      if (videos) {
        const { freedBytes, removedCount, skippedCount } = result.cleanup;
        notifications.notify({
          key,
          tone: skippedCount ? 'warning' : 'success',
          title: t(
            skippedCount
              ? 'librarySettings.storage.videos.incomplete'
              : removedCount
                ? 'librarySettings.storage.videos.cleaned'
                : 'librarySettings.storage.videos.nothingToClean',
          ),
          message:
            removedCount || skippedCount
              ? t('librarySettings.storage.videos.result', {
                  count: removedCount,
                  size: formatBytes(freedBytes),
                })
              : '',
        });
        return true;
      }
      const freedBytes = result?.cleanup?.freedBytes;
      notifications.notify({
        key,
        title: t(
          freedBytes > 0
            ? 'librarySettings.storage.cleaned'
            : 'librarySettings.storage.nothingToClean',
        ),
        message:
          freedBytes > 0
            ? t('librarySettings.storage.freed', {
                size: formatBytes(freedBytes),
              })
            : t('librarySettings.storage.originalsKept'),
      });
      return true;
    } catch {
      notifications.notify({
        key,
        tone: 'danger',
        title: t(
          videos
            ? 'librarySettings.storage.videos.notCleaned'
            : 'librarySettings.storage.notCleaned',
        ),
        message: t('librarySettings.storage.retry'),
      });
      return false;
    } finally {
      state.cleaning = '';
    }
  }

  function dispose(consumer) {
    consumers.delete(consumer);
    if (consumers.size) return;
    unsubscribeLibraryUpdated?.();
    unsubscribeLibraryUpdated = null;
  }

  return {
    storage: computed(() => snapshot.value?.storage ?? null),
    policy: computed(() => snapshot.value?.policy ?? defaultPolicy()),
    lastCleanup: computed(() => snapshot.value?.cleanup ?? null),
    loading: computed(() => state.loading),
    saving: computed(() => state.saving),
    cleaning: computed(() => Boolean(state.cleaning)),
    cleaningVideos: computed(() => state.cleaning === 'videos'),
    readError: computed(() => state.readError),
    saveError: computed(() => state.saveError),
    error: computed(() => state.saveError || state.readError),
    initialize,
    refresh,
    setPolicy,
    cleanup: () => cleanup(),
    cleanupVideos: () => cleanup('videos'),
    dispose,
  };
}

// Requests and busy/error state survive Settings unmounts. Only the mounted
// consumers' library subscription is released; a pending operation still owns
// its snapshot and publishes its single result.
export function useLibraryStorage(options = {}) {
  const bridge = resolveBridge(options.bridge) ?? unavailableBridge;
  if (!sessions.has(bridge)) sessions.set(bridge, createStorageSession(bridge));
  const session = sessions.get(bridge);
  const consumer = Symbol('storage-consumer');
  return {
    ...session,
    initialize: () => session.initialize(consumer),
    dispose: () => session.dispose(consumer),
  };
}

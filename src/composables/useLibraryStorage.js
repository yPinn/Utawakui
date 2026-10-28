import { computed, reactive, shallowRef } from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import storageValues from '../../shared/libraryStorageValues.json';
import { useAppNotifications } from './useAppNotifications.js';
import { formatBytes } from '../utils/format.js';

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
    cleaning: false,
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
      state.readError = '目前無法讀取曲庫空間。';
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
      state.readError = '目前無法讀取曲庫空間。';
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
      state.saveError = '目前無法儲存曲庫空間設定，已保留原設定。';
      return false;
    } finally {
      state.saving = false;
    }
  }

  async function cleanup() {
    if (state.cleaning || state.saving) {
      return false;
    }

    ++revision;
    state.loading = false;
    state.cleaning = true;
    try {
      const result = await bridge.cleanupLibraryStorage();
      applySnapshot(result);
      state.readError = '';
      const freedBytes = result?.cleanup?.freedBytes;
      notifications.notify({
        key: NOTIFICATION_KEYS.LIBRARY_CLEANUP,
        title: freedBytes > 0 ? '去人聲版本已清理' : '目前不需清理',
        message:
          freedBytes > 0
            ? `已釋放 ${formatBytes(freedBytes)}。原始歌曲已保留。`
            : '原始歌曲已保留。',
      });
      return true;
    } catch {
      notifications.notify({
        key: NOTIFICATION_KEYS.LIBRARY_CLEANUP,
        tone: 'danger',
        title: '去人聲版本未清理',
        message: '請再試一次。',
      });
      return false;
    } finally {
      state.cleaning = false;
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
    cleaning: computed(() => state.cleaning),
    readError: computed(() => state.readError),
    saveError: computed(() => state.saveError),
    error: computed(() => state.saveError || state.readError),
    initialize,
    refresh,
    setPolicy,
    cleanup,
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

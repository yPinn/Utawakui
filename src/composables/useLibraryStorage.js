import { computed, reactive, shallowRef } from 'vue';
import storageValues from '../../shared/libraryStorageValues.json';

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

export function useLibraryStorage(options = {}) {
  const bridge = resolveBridge(options.bridge);
  const snapshot = shallowRef(null);
  const state = reactive({
    loading: false,
    saving: false,
    cleaning: false,
    error: '',
  });
  let unsubscribeLibraryUpdated = null;

  function applySnapshot(nextSnapshot) {
    if (!nextSnapshot || typeof nextSnapshot !== 'object') return;
    snapshot.value = nextSnapshot;
  }

  async function refresh() {
    if (typeof bridge?.getLibraryStorage !== 'function') {
      state.error = '目前無法讀取曲庫空間。';
      return false;
    }

    state.loading = true;
    try {
      applySnapshot(await bridge.getLibraryStorage());
      state.error = '';
      return true;
    } catch {
      state.error = '目前無法讀取曲庫空間。';
      return false;
    } finally {
      state.loading = false;
    }
  }

  async function initialize() {
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
    if (state.saving || typeof bridge?.setLibraryStoragePolicy !== 'function') {
      return false;
    }

    state.saving = true;
    state.error = '';
    try {
      applySnapshot(await bridge.setLibraryStoragePolicy(policy));
      return true;
    } catch {
      state.error = '目前無法儲存曲庫空間設定。';
      return false;
    } finally {
      state.saving = false;
    }
  }

  async function cleanup() {
    if (state.cleaning || typeof bridge?.cleanupLibraryStorage !== 'function') {
      return false;
    }

    state.cleaning = true;
    state.error = '';
    try {
      applySnapshot(await bridge.cleanupLibraryStorage());
      return true;
    } catch {
      state.error = '目前無法清理去人聲版本。';
      return false;
    } finally {
      state.cleaning = false;
    }
  }

  function dispose() {
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
    error: computed(() => state.error),
    initialize,
    refresh,
    setPolicy,
    cleanup,
    dispose,
  };
}

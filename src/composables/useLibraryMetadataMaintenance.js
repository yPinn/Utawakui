import { computed, reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';

const sessions = new WeakMap();
const unavailableBridge = {};

function createSession(
  bridge,
  requireFeatureGate,
  reloadLibrary = async () => {
    const library = useLibrary(),
      playlists = usePlaylists();
    await Promise.all([
      library.refresh({ allowProviderBackfill: false }),
      playlists.refresh(),
    ]);
    if (library.state.error || playlists.state.error)
      throw Error('Library unavailable');
  },
) {
  const state = reactive({
    busy: false,
    cancelling: false,
    progress: null,
    message: '',
    error: false,
  });
  let pending = null;

  function refresh() {
    if (pending) return pending;
    if (state.busy) return Promise.resolve(false);
    state.busy = true;
    state.message = '';
    state.error = false;
    state.progress = null;
    pending = (async () => {
      let dispose;
      let disposeScope;
      let currentEpoch = null;
      let requestEpoch = null;
      let stale = false;
      function changedScope() {
        stale = true;
        state.progress = null;
        state.message = '曲庫位置已變更，請重新更新。';
      }
      function accept(progress) {
        if (stale) return false;
        requestEpoch ??= progress?.libraryEpoch;
        if (currentEpoch !== null && currentEpoch !== requestEpoch) {
          changedScope();
          return false;
        }
        state.progress = progress;
        return true;
      }
      try {
        if (
          !(await requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
            source: 'library-metadata',
            operation: 'refresh-releases',
            message: '啟用外部來源後，即可補齊所屬發行與完整曲序。',
          }))
        ) {
          state.message = '請先啟用外部來源。';
          return false;
        }
        if (typeof bridge.refreshReleaseMetadata !== 'function')
          throw new Error('Unavailable');
        disposeScope = bridge.onReleaseOrganizationChanged?.((event) => {
          currentEpoch = event.libraryEpoch;
          if (requestEpoch !== null && currentEpoch !== requestEpoch)
            changedScope();
        });
        dispose = bridge.onReleaseMetadataProgress?.(accept);
        const result = await bridge.refreshReleaseMetadata();
        if (result?.status === 'disabled') {
          state.message = '請先啟用外部來源。';
          return false;
        }
        if (!accept(result)) return false;
        if (!['complete', 'cancelled', 'interrupted'].includes(result?.status))
          throw new Error('Invalid result');
        state.error = false;
        const filled = `已補齊 ${result.updated} 張作品`;
        if (result.status === 'cancelled')
          state.message = `已停止，${filled}。`;
        else if (result.status === 'interrupted') {
          state.error = true;
          state.message = `更新中斷，${filled}。請確認曲庫與外部來源設定後重試。`;
        } else if (result.total === 0)
          state.message = '目前沒有可從來源補齊的作品。';
        else
          state.message = `${filled}。${result.unresolved ? `仍有 ${result.unresolved} 個來源資訊不完整，可稍後重試。` : ''}`;
        if (result.needsConfirmation > 0)
          state.message += `另有 ${result.needsConfirmation} 首需由曲目選單「補齊專輯資料」確認歸屬。`;
        return result.status === 'complete';
      } catch {
        if (stale) return false;
        state.error = true;
        state.message = '目前無法更新發行資訊，請稍後再試。';
        return false;
      } finally {
        dispose?.();
        disposeScope?.();
        state.busy = false;
        state.cancelling = false;
        pending = null;
      }
    })();
    return pending;
  }
  async function cancel() {
    if (!state.busy || state.cancelling) return;
    state.cancelling = true;
    state.error = false;
    state.message = '';
    try {
      await bridge.cancelReleaseMetadata();
    } catch {
      state.cancelling = false;
      state.message = '目前無法停止，請稍後再試。';
      state.error = true;
    }
  }
  const feedback = computed(() =>
    state.error && state.message
      ? state.message
      : state.busy && state.progress?.status === 'running'
        ? `${state.cancelling ? '停止中' : '查詢中'} · ${state.progress.completed} / ${state.progress.total} 個來源 · 已補齊 ${state.progress.updated} 張`
        : state.message,
  );
  async function reload() {
    if (state.busy) return false;
    state.busy = true;
    state.progress = null;
    state.error = false;
    state.message = '';
    try {
      await reloadLibrary();
      state.message = '已重新讀取本地曲庫。';
      return true;
    } catch {
      state.error = true;
      state.message = '目前無法重新讀取曲庫，請稍後再試。';
      return false;
    } finally {
      state.busy = false;
    }
  }
  return { state: readonly(state), feedback, refresh, cancel, reload };
}

// One request and subscription survive Settings remounts; the subscription is
// released when the request settles, not when a transient page is unmounted.
export function useLibraryMetadataMaintenance(options = {}) {
  const bridge =
    options.bridge ??
    (typeof window !== 'undefined' ? window.Utawakui : null) ??
    unavailableBridge;
  if (!sessions.has(bridge))
    sessions.set(
      bridge,
      createSession(
        bridge,
        options.requireFeatureGate ?? useFeatureGateAccess().requireFeatureGate,
        options.reloadLibrary,
      ),
    );
  return sessions.get(bridge);
}

import { computed, reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import { t } from '../utils/i18n.js';

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
        state.message = t('librarySettings.metadata.locationChanged');
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
            message: t('librarySettings.metadata.enableSourcesNotice'),
          }))
        ) {
          state.message = t('librarySettings.metadata.enableSources');
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
          state.message = t('librarySettings.metadata.enableSources');
          return false;
        }
        if (!accept(result)) return false;
        if (!['complete', 'cancelled', 'interrupted'].includes(result?.status))
          throw new Error('Invalid result');
        state.error = false;
        const count = (key) =>
          t(
            `librarySettings.metadata.${key}`,
            { count: result.updated },
            result.updated,
          );
        if (result.status === 'cancelled') state.message = count('stopped');
        else if (result.status === 'interrupted') {
          state.error = true;
          state.message = count('interrupted');
        } else if (result.total === 0)
          state.message = t('librarySettings.metadata.nothingToFill');
        else if (result.unresolved > 0)
          state.message = t(
            'librarySettings.metadata.filledWithIssues',
            { updated: result.updated, count: result.unresolved },
            result.unresolved,
          );
        else state.message = count('filled');
        return result.status === 'complete';
      } catch {
        if (stale) return false;
        state.error = true;
        state.message = t('librarySettings.metadata.refreshFailed');
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
      state.message = t('librarySettings.metadata.stopFailed');
      state.error = true;
    }
  }
  const feedback = computed(() =>
    state.error && state.message
      ? state.message
      : state.busy && state.progress?.status === 'running'
        ? t(
            state.cancelling
              ? 'librarySettings.metadata.progressStopping'
              : 'librarySettings.metadata.progressQuerying',
            {
              completed: state.progress.completed,
              total: state.progress.total,
            },
          )
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
      state.message = t('librarySettings.metadata.reloaded');
      return true;
    } catch {
      state.error = true;
      state.message = t('librarySettings.metadata.reloadFailed');
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

import { computed, reactive, readonly } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { useAppNotifications } from '../useAppNotifications.js';
import {
  PERFORMANCE_SETTINGS_DEFAULTS as defaults,
  validPerformanceSettings,
  validPerformanceSlot,
} from '../../../shared/performanceSettings.mjs';

const messages = {
  invalid: '歌曲設定已損壞，原檔已保留。',
  unsupported: '歌曲設定來自較新版本，請更新應用程式。',
  'source-stale': '歌曲音源已變更，已保存的設定需要重新確認。',
  conflict: '歌曲設定已變更，請重新讀取後再保存。',
  stale: '歌曲情境已變更，請重新讀取。',
  'not-found': '目前找不到這首歌的音訊。',
  timeout: '歌曲設定處理逾時，請重新讀取確認結果。',
};
const same = (left, right, guide = true) =>
  Object.keys(defaults).every(
    (key) =>
      (!guide && key === 'monitorGuideVocalEnabled') ||
      left?.[key] === right?.[key],
  );

// Owns saved baseline and IO lifetimes only. DSP confirmation and transport
// remain with the graph and player; no shadow applied values or playback clock.
export function usePlayerPerformanceSettings({
  playerState,
  graph,
  applyValues,
  onScopeInvalidated = () => {},
  bridge = typeof window === 'undefined' ? null : window.Utawakui,
  notifications = useAppNotifications(),
}) {
  const state = reactive({
    trackId: null,
    snapshot: null,
    reading: false,
    writing: false,
    applying: false,
    blocked: false,
    error: null,
    selectedSlot: 1,
    copiedDraft: false,
  });
  let generation = 0,
    readRevision = 0,
    restorePromise = null,
    finishRead = null;
  let retryRequest = null;
  let usingDefaults = false;
  let returnSelection = null;
  const belongsToCurrentOccurrence = (selection) =>
    selection?.trackId === playerState.track?.id &&
    selection?.playbackRevision === playerState.playbackRevision;
  const values = () => ({
    transposeSemitones: playerState.transposeSemitones,
    pitchCents: playerState.pitchCents,
    tempoRate: playerState.tempoRate,
    monitorGuideVocalEnabled: playerState.guideVocalOn,
  });
  const ownsTrack = () => state.trackId === playerState.track?.id;
  const busy = computed(
    () =>
      state.reading ||
      state.writing ||
      state.applying ||
      Boolean(playerState.pendingStartTrackId),
  );
  const selectedValues = computed(() =>
    state.snapshot?.slots
      ? state.snapshot.slots[state.selectedSlot - 1]
      : state.selectedSlot === 1
        ? state.snapshot?.values
        : null,
  );
  const hasSaved = computed(() => Boolean(selectedValues.value));
  const dirty = computed(
    () =>
      ownsTrack() &&
      (state.copiedDraft ||
        !same(
          values(),
          selectedValues.value ?? defaults,
          Boolean(playerState.track?.usesSeparatedAudio),
        )),
  );
  const canSave = computed(() => {
    const result = playerState.audioControlApplication;
    return (
      ownsTrack() &&
      !busy.value &&
      Boolean(state.snapshot?.token) &&
      graph.isPlaybackReady(result) &&
      validPerformanceSettings(result?.applied) &&
      same(values(), result.applied)
    );
  });
  function clearError() {
    state.error = null;
    notifications.clear(NOTIFICATION_KEYS.PLAYER_PERFORMANCE_SETTINGS);
  }
  function setError(message) {
    state.error = message;
    notifications.notify({
      key: NOTIFICATION_KEYS.PLAYER_PERFORMANCE_SETTINGS,
      title: '歌曲設定未完成',
      message,
      tone: 'danger',
      lifecycle: 'persistent',
    });
  }
  function error(result) {
    setError(
      messages[result?.status] ?? '歌曲設定暫時無法讀取或保存，請再試一次。',
    );
  }
  function cancelPreparation() {
    readRevision++;
    finishRead?.(null);
    finishRead = null;
    state.reading = false;
  }
  function clear() {
    generation++;
    restorePromise = null;
    retryRequest = null;
    usingDefaults = false;
    returnSelection = null;
    cancelPreparation();
    if (state.snapshot?.token)
      void bridge
        ?.cancelPerformanceSettings?.({ token: state.snapshot.token })
        ?.catch(() => {});
    state.trackId = null;
    state.snapshot = null;
    state.writing = false;
    state.applying = false;
    clearError();
    state.blocked = false;
    state.selectedSlot = 1;
    state.copiedDraft = false;
  }
  function cancelStart() {
    const track = playerState.track;
    const selection = belongsToCurrentOccurrence(returnSelection)
      ? returnSelection
      : null;
    // A normal paused restore still owns this track's background read. Cancelling
    // transport must not leave a failed restore promise for the next Play.
    if (
      track &&
      state.trackId === track.id &&
      (!selection || !playerState.pendingStartTrackId)
    )
      return;
    cancelPreparation();
    if (!track) return;
    // Uncommitted replacements, including the same id, retain the old controls.
    clear();
    state.trackId = track.id;
    state.selectedSlot = selection?.slot ?? 1;
    state.copiedDraft = selection?.copiedDraft ?? false;
    usingDefaults = selection?.usingDefaults ?? false;
    const currentGeneration = generation;
    restorePromise = read(track).then((target) => {
      if (target && generation === currentGeneration && !selection)
        state.selectedSlot = state.snapshot?.defaultSlot ?? 1;
      return Boolean(target);
    });
  }
  async function read(track, isCurrent = () => true) {
    cancelPreparation();
    const currentGeneration = generation,
      revision = ++readRevision;
    const current = () =>
      currentGeneration === generation &&
      revision === readRevision &&
      isCurrent();
    state.reading = true;
    clearError();
    let timer;
    const interrupted = new Promise((done) => {
      finishRead = done;
      timer = setTimeout(() => done({ status: 'timeout' }), 10_000);
    });
    try {
      const response =
        typeof bridge?.getPerformanceSettings === 'function'
          ? Promise.resolve().then(() =>
              bridge.getPerformanceSettings({ trackId: track.id }),
            )
          : Promise.resolve({ status: 'absent', values: null });
      const result = await Promise.race([response, interrupted]);
      if (!current() || !result) return null;
      if (
        (result.trackId !== undefined && result.trackId !== track.id) ||
        !['saved', 'absent', 'removed'].includes(result.status) ||
        (result.status === 'saved' && !validPerformanceSettings(result.values))
      ) {
        state.snapshot = null;
        error(result);
        return null;
      }
      state.snapshot = result;
      return { ...(result.values ?? defaults) };
    } catch {
      if (current()) {
        state.snapshot = null;
        error();
      }
      return null;
    } finally {
      clearTimeout(timer);
      if (current()) {
        state.reading = false;
        finishRead = null;
      }
    }
  }
  async function prepare(
    track,
    { isCurrent = () => true, useDefaults = false, retry } = {},
  ) {
    const retained =
      playerState.pendingStartTrackId &&
      belongsToCurrentOccurrence(returnSelection)
        ? returnSelection
        : null;
    const selection =
      retained ??
      (ownsTrack()
        ? {
            trackId: state.trackId,
            playbackRevision: playerState.playbackRevision,
            slot: state.selectedSlot,
            copiedDraft: state.copiedDraft,
            usingDefaults,
          }
        : returnSelection);
    clear();
    if (selection && belongsToCurrentOccurrence(selection))
      returnSelection = selection;
    state.trackId = track.id;
    if (useDefaults) {
      usingDefaults = true;
      return { ...defaults };
    }
    const currentGeneration = generation;
    const target = await read(track, isCurrent);
    if (generation === currentGeneration && isCurrent()) {
      state.selectedSlot = state.snapshot?.defaultSlot ?? 1;
      state.blocked = !target && Boolean(state.error);
      retryRequest = state.blocked ? retry : null;
    }
    return target;
  }
  function restore(track) {
    let restoreGeneration;
    const current = () =>
      generation === restoreGeneration &&
      ownsTrack() &&
      state.trackId === track.id;
    const before = values(),
      applicationRevision = playerState.audioControlApplication?.revision;
    const accept = (target, force = false) => {
      if (!current()) return false;
      if (
        target &&
        ownsTrack() &&
        (force ||
          (playerState.audioControlApplication?.revision ===
            applicationRevision &&
            same(before, values())))
      )
        graph.stageAudioControls(target);
      if (target) commitPreparedSelection();
      state.blocked = !target && Boolean(state.error);
      return Boolean(target);
    };
    const retry = (useDefaults) => {
      if (!current()) return Promise.resolve(false);
      if (useDefaults) {
        usingDefaults = true;
        clearError();
      }
      restorePromise = useDefaults
        ? Promise.resolve(accept(defaults, true))
        : read(track).then((target) => {
            if (target && current())
              state.selectedSlot = state.snapshot?.defaultSlot ?? 1;
            return accept(target);
          });
      return restorePromise;
    };
    const preparation = prepare(track, { retry });
    restoreGeneration = generation;
    restorePromise = preparation.then(accept);
    return restorePromise;
  }
  async function ensure(track, isCurrent, useDefaults = false, retry) {
    if (useDefaults) {
      clearError();
      state.blocked = false;
      usingDefaults = true;
      graph.stageAudioControls(defaults);
      return true;
    }
    if (belongsToCurrentOccurrence(returnSelection)) cancelStart();
    if (usingDefaults && state.trackId === track.id) return true;
    if (restorePromise) {
      const pending = restorePromise;
      const ready = await pending;
      if (restorePromise === pending) restorePromise = null;
      return ready && isCurrent();
    }
    if (state.trackId === track.id && state.snapshot) return true;
    const target = await prepare(track, { isCurrent, retry });
    if (target && isCurrent()) graph.stageAudioControls(target);
    return Boolean(target && isCurrent());
  }
  async function write(action = 'save') {
    if (
      !ownsTrack() ||
      busy.value ||
      !state.snapshot?.token ||
      (action === 'save' && !canSave.value) ||
      (action === 'setDefault' && !hasSaved.value)
    )
      return false;
    const currentGeneration = generation,
      trackId = state.trackId;
    const snapshot = state.snapshot;
    const input = {
      trackId,
      token: snapshot.token,
      expectedRevision: snapshot.revision,
      slot: state.selectedSlot,
      ...(action === 'save'
        ? { values: { ...playerState.audioControlApplication.applied } }
        : {}),
    };
    state.writing = true;
    clearError();
    try {
      const result = await (action === 'remove'
        ? bridge.removePerformanceSettings(input)
        : action === 'setDefault'
          ? bridge.setDefaultPerformanceSettings(input)
          : bridge.savePerformanceSettings(input));
      if (generation !== currentGeneration || !ownsTrack()) return false;
      if (!['saved', 'removed'].includes(result?.status)) {
        error(result);
        return false;
      }
      state.snapshot = result;
      if (action === 'save') state.copiedDraft = false;
      return true;
    } catch {
      if (generation === currentGeneration) error();
      return false;
    } finally {
      if (generation === currentGeneration) state.writing = false;
    }
  }
  async function apply(target, { preservePlayback = false } = {}) {
    if (!ownsTrack() || busy.value || !target) return false;
    const currentGeneration = generation;
    state.applying = true;
    clearError();
    try {
      const result = await applyValues({ ...target }, { preservePlayback });
      if (generation !== currentGeneration) return false;
      if (result?.status === 'cancelled') return false;
      if (
        (result?.ok || result?.status === 'deferred') &&
        (result.revision !== playerState.audioControlApplication?.revision ||
          !same(values(), target))
      )
        return false;
      // A paused lazy restore may stage a set before the first graph exists.
      // It remains unconfirmed and unsaveable until explicit playback prepares it.
      if (
        preservePlayback &&
        !playerState.isPlaying &&
        result?.status === 'deferred'
      )
        return true;
      if (!result?.ok) {
        setError('本次演唱設定尚未確認套用，請確認輸出裝置後重試。');
        return false;
      }
      return true;
    } catch {
      if (generation === currentGeneration)
        setError('本次演唱設定尚未完成，請再試一次。');
      return false;
    } finally {
      if (generation === currentGeneration) state.applying = false;
    }
  }
  async function applyToSlot(slot, target, copiedDraft = false) {
    if (
      !ownsTrack() ||
      busy.value ||
      !validPerformanceSlot(slot) ||
      slot === state.selectedSlot
    )
      return false;
    const currentGeneration = generation;
    if (!(await apply(target, { preservePlayback: true }))) return false;
    if (generation !== currentGeneration || !ownsTrack()) return false;
    state.selectedSlot = slot;
    state.copiedDraft = copiedDraft;
    return true;
  }
  function resetSlot(slot) {
    if (!validPerformanceSlot(slot)) return Promise.resolve(false);
    return slot === state.selectedSlot
      ? apply(defaults, { preservePlayback: true })
      : applyToSlot(slot, defaults);
  }
  function commitPreparedSelection() {
    returnSelection = null;
  }
  const unsubscribe = bridge?.onPerformanceSettingsInvalidated?.((event) => {
    if (!event.trackId || event.trackId === state.trackId) {
      const invalidatedTrack = state.trackId;
      onScopeInvalidated(event);
      if (!event.trackId || state.trackId === invalidatedTrack) clear();
    }
  });
  return {
    state: readonly(state),
    busy,
    canSave,
    hasSaved,
    dirty,
    prepare,
    async verifySource() {
      const snapshot = state.snapshot,
        currentGeneration = generation;
      if (
        !ownsTrack() ||
        !snapshot?.token ||
        !bridge?.verifyPerformanceSettingsSource
      )
        return false;
      try {
        const result = await bridge.verifyPerformanceSettingsSource({
          trackId: state.trackId,
          token: snapshot.token,
        });
        return (
          generation === currentGeneration &&
          ownsTrack() &&
          result?.status === 'equivalent'
        );
      } catch {
        return false;
      }
    },
    restore,
    ensure,
    clear,
    cancelPreparation,
    cancelStart,
    commitPreparedSelection,
    save: () => write(),
    remove: () => write('remove'),
    setDefault: () => write('setDefault'),
    resetSlot,
    selectSlot(slot) {
      const target = state.snapshot?.slots
        ? state.snapshot.slots[slot - 1]
        : slot === 1
          ? state.snapshot?.values
          : null;
      return applyToSlot(slot, target ?? defaults);
    },
    async copyToSlot(slot) {
      if (!hasSaved.value) return false;
      return applyToSlot(slot, selectedValues.value, true);
    },
    reload: () =>
      ownsTrack() && !busy.value
        ? read(playerState.track)
        : Promise.resolve(null),
    reset: () => resetSlot(state.selectedSlot),
    dispose() {
      clear();
      unsubscribe?.();
    },
    retry: () => retryRequest?.(false),
    useDefaultsOnce: () => retryRequest?.(true),
  };
}

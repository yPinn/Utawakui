import { computed, reactive, readonly, watch } from 'vue';
import { t } from '../utils/i18n.js';

// Occurrence progress belongs to the arrangement; timing and play state belong
// exclusively to the existing audio player. No OBS state enters this boundary.
export function usePerformanceSessionPlaybackController({
  plan,
  player,
  queue,
  getTracks,
  toPlayableTrack,
  continuousStorage,
}) {
  const state = reactive({
    current: null,
    busy: false,
    error: null,
    continuous: false,
    engaged: false,
  });
  let request = null;
  const instanceId = globalThis.crypto.randomUUID();
  let sequence = 0;
  let ownedToken = null;
  let clearing = false;
  let actions = Promise.resolve();
  let disposed = false;
  const currentItem = computed(() => state.current);
  const pendingItems = computed(() =>
    plan.state.plan.items.filter(
      (item) =>
        (item.progress ?? 'queued') === 'queued' &&
        item.itemId !== state.current?.itemId,
    ),
  );
  const historyItems = computed(() =>
    plan.state.plan.items
      .filter((item) =>
        ['completed', 'skipped', 'interrupted'].includes(item.progress),
      )
      .sort((a, b) =>
        (a.progressUpdatedAt ?? '').localeCompare(b.progressUpdatedAt ?? ''),
      ),
  );
  const ownsPlayback = computed(() => state.engaged);
  const nextReadyItem = computed(() =>
    pendingItems.value.find((item) => item.ready),
  );
  const canStart = computed(() => Boolean(nextReadyItem.value));
  const hasPlayed = computed(() =>
    historyItems.value.some((item) => item.progress !== 'skipped'),
  );
  const canAdvance = computed(() =>
    Boolean(nextReadyItem.value && nextReadyItem.value.mode !== 'manual'),
  );
  const canNext = computed(() => state.engaged && canAdvance.value);
  const continuousKey = (sessionId) =>
    `utawakui.performance-session.continuous.${sessionId}`;
  const stopWatchingSession = watch(
    () => plan.state.plan.sessionId,
    (id) => {
      state.continuous = false;
      if (!id) return;
      try {
        state.continuous =
          (continuousStorage ?? globalThis.localStorage)?.getItem(
            continuousKey(id),
          ) === 'true';
      } catch {
        // An unavailable preference store leaves continuous playback off.
      }
    },
    { immediate: true, flush: 'sync' },
  );

  function setContinuous(value) {
    const id = plan.state.plan.sessionId;
    if (!id) return;
    state.continuous = value === true;
    try {
      const storage = continuousStorage ?? globalThis.localStorage;
      if (state.continuous) storage?.setItem(continuousKey(id), 'true');
      else storage?.removeItem(continuousKey(id));
    } catch {
      // The choice still applies in the currently open session.
    }
  }

  function enqueue(operation) {
    const task = actions.then(async () => {
      if (disposed) return false;
      state.busy = true;
      try {
        return await operation();
      } catch {
        state.error = t('session.playback.progressNotUpdated');
        return false;
      } finally {
        state.busy = false;
      }
    });
    actions = task;
    return task;
  }

  function matches(active, event) {
    return Boolean(
      active &&
      !active.manual &&
      player.state.track?.arrangementRequestId === active.token &&
      event?.trackId === active.item.trackId &&
      event.playbackRevision === active.playbackRevision,
    );
  }

  async function confirmPlaying(active) {
    if (active.confirmation) return active.confirmation;
    active.confirmation = plan.setProgress(active.item.itemId, 'playing');
    const saved = await active.confirmation;
    if (!saved) {
      state.error = t('session.playback.progressNotSavedStop');
      if (request === active) player.pause();
    }
    return saved;
  }

  function release(active) {
    if (request !== active) return;
    request = null;
    state.current = null;
  }

  async function finish(active, progress) {
    if (!active) return true;
    if (active.confirmation && !(await active.confirmation)) {
      if (progress === 'completed') return false;
      await plan.refresh?.();
    }
    const item = plan.state.plan.items.find(
      (item) => item.itemId === active.item.itemId,
    );
    if (
      item?.progress === 'playing' &&
      !(await plan.setProgress(item.itemId, progress))
    ) {
      state.error = t('session.playback.progressNotSaved');
      return false;
    }
    release(active);
    if (player.state.track?.arrangementRequestId === active.token) {
      clearing = true;
      try {
        player.clearTrack();
      } finally {
        clearing = false;
      }
    }
    return true;
  }

  async function startItem(itemId) {
    const item = plan.state.plan.items.find((item) => item.itemId === itemId);
    if (!item?.ready || (item.progress ?? 'queued') !== 'queued') return false;
    if (request && !(await stopItem('interrupted'))) return false;
    const track =
      item.mode === 'manual'
        ? null
        : getTracks().find((track) => track.id === item.trackId);
    if (item.mode !== 'manual' && !track?.url) {
      state.error = t('session.playback.audioMissing');
      return false;
    }
    const active = {
      item: { ...item },
      manual: item.mode === 'manual',
      token: `arrangement-${instanceId}-${++sequence}`,
      playbackRevision: null,
      confirmation: null,
      ending: false,
    };
    request = active;
    ownedToken = active.token;
    state.current = active.item;
    state.engaged = true;
    state.error = null;
    if (active.manual) {
      player.cancelPendingStart();
      player.clearTrack();
      if (!(await confirmPlaying(active))) {
        release(active);
        return false;
      }
      return true;
    }
    // Repeat-one loops inside HTML audio and has no ended event. Arrangement
    // starts explicitly select sequence; its own continuous switch owns advance.
    player.setPlaybackMode?.('sequence');
    const started = await player.playTrack({
      ...toPlayableTrack(track),
      arrangementRequestId: active.token,
    });
    if (request !== active || disposed) return false;
    if (!started) {
      if (active.confirmation) await finish(active, 'interrupted');
      else release(active);
      if (!active.ending) state.error = t('session.playback.startFailed');
      return false;
    }
    active.playbackRevision = player.state.playbackRevision;
    queue.interruptWithTrack(track, { preserveQueue: true });
    return true;
  }

  async function stopItem(progress) {
    const active = request;
    if (!active) return true;
    active.ending = true;
    if (
      active.manual ||
      player.state.track?.arrangementRequestId === active.token
    ) {
      player.cancelPendingStart();
      player.pause();
    }
    return finish(active, progress);
  }

  function advanceAfterCompletion() {
    return state.continuous && state.engaged && canAdvance.value
      ? startItem(nextReadyItem.value.itemId)
      : true;
  }

  function cancelPendingStart() {
    if (!state.busy || !request || request.manual) return;
    request.ending = true;
    player.cancelPendingStart();
    player.pause();
    if (player.state.track?.arrangementRequestId === request.token) {
      clearing = true;
      try {
        player.clearTrack();
      } finally {
        clearing = false;
      }
    }
  }

  function handleEnded(event) {
    const active = request;
    if (!matches(active, event) || active.ending) return false;
    active.ending = true;
    void enqueue(async () => {
      if (!active.confirmation) {
        await finish(active, 'interrupted');
        state.error = t('session.playback.startUnconfirmed');
        return false;
      }
      if (!(await finish(active, 'completed'))) return false;
      return advanceAfterCompletion();
    });
    return true;
  }

  const unsubscribes = [
    player.onPlaying((event) => {
      const active = request;
      if (
        !active ||
        active.manual ||
        active.ending ||
        player.state.track?.arrangementRequestId !== active.token
      )
        return;
      const item = plan.state.plan.items.find(
        (item) => item.itemId === active.item.itemId,
      );
      if (
        !active.confirmation &&
        (!item?.ready ||
          item.trackId !== active.item.trackId ||
          item.revision !== active.item.revision)
      ) {
        active.ending = true;
        player.pause();
        void enqueue(() => finish(active, 'interrupted'));
        state.error = t('session.playback.changedBeforeStart');
        return;
      }
      active.playbackRevision ??= event.playbackRevision;
      if (!matches(active, event)) return;
      return confirmPlaying(active);
    }),
    player.onStopped((event) => {
      const active = request;
      if (!matches(active, event) || active.ending) return;
      active.ending = true;
      void enqueue(async () => {
        if (!(await finish(active, 'interrupted'))) return;
        state.error =
          event.reason === 'error' ? t('session.playback.interrupted') : null;
      });
    }),
    watch(
      () => player.state.track,
      (track) => {
        if (clearing) return;
        const active = request;
        if (
          !active &&
          state.engaged &&
          track?.arrangementRequestId !== ownedToken
        )
          state.engaged = false;
        if (
          !active ||
          (active.manual && !track) ||
          active.ending ||
          track?.arrangementRequestId === active.token
        )
          return;
        active.ending = true;
        state.engaged = false;
        void enqueue(() => finish(active, 'interrupted'));
      },
      { flush: 'sync' },
    ),
  ];

  return {
    state: readonly(state),
    currentItem,
    pendingItems,
    historyItems,
    ownsPlayback,
    canNext,
    canStart,
    nextReadyItem,
    hasPlayed,
    start: (itemId) => enqueue(() => startItem(itemId)),
    startNext: () =>
      enqueue(() => {
        const item = nextReadyItem.value;
        return item && !request ? startItem(item.itemId) : false;
      }),
    replay: (itemId) =>
      enqueue(async () => {
        const item = plan.state.plan.items.find(
          (item) => item.itemId === itemId,
        );
        if (item?.progress !== 'completed' || !item.ready) return false;
        const createdId = await plan.duplicateItemForPlayback(itemId);
        return createdId ? startItem(createdId) : false;
      }),
    next: () => {
      if (!canAdvance.value) return Promise.resolve(false);
      cancelPendingStart();
      return enqueue(async () => {
        if (!canAdvance.value || !(await stopItem('interrupted'))) return false;
        return canAdvance.value && startItem(nextReadyItem.value.itemId);
      });
    },
    previous: () => {
      if (request && !request.manual) return player.restartTrack();
    },
    complete: () =>
      enqueue(async () => {
        if (!request?.confirmation) return false;
        if (!(await stopItem('completed'))) return false;
        return advanceAfterCompletion();
      }),
    stop: () => {
      cancelPendingStart();
      return enqueue(() => stopItem('interrupted'));
    },
    skip: (itemId) => enqueue(() => plan.setProgress(itemId, 'skipped')),
    handleEnded,
    setContinuous,
    async settled() {
      let previous;
      do {
        previous = actions;
        await previous;
      } while (previous !== actions);
    },
    dispose() {
      if (disposed) return;
      if (request) {
        request.ending = true;
        player.cancelPendingStart();
        player.pause();
        void finish(request, 'interrupted');
      }
      disposed = true;
      stopWatchingSession();
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
  };
}

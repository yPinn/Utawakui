import { computed, reactive, readonly, watch } from 'vue';

// Occurrence progress belongs to the arrangement; timing and play state belong
// exclusively to the existing audio player. No OBS state enters this boundary.
export function usePerformanceSessionPlaybackController({
  plan,
  player,
  queue,
  getTracks,
  toPlayableTrack,
}) {
  const state = reactive({
    current: null,
    busy: false,
    error: null,
    continuous: true,
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
  const canStart = computed(() =>
    pendingItems.value.some((item) => item.ready),
  );
  const canNext = computed(
    () => state.engaged && pendingItems.value.some((item) => item.ready),
  );

  function enqueue(operation) {
    const task = actions.then(async () => {
      if (disposed) return false;
      state.busy = true;
      try {
        return await operation();
      } catch {
        state.error = '曲目進度未更新，請重試。';
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
      state.error = '播放進度未儲存，請停止後重試。';
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
      state.error = '曲目進度未儲存，請重試。';
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
      state.error = '找不到可播放的音檔，請重新連結曲目。';
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
      if (!active.ending) state.error = '這首曲目未能開始，請重試或檢查音檔。';
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

  function nextItem() {
    const item = pendingItems.value.find((item) => item.ready);
    return item ? startItem(item.itemId) : false;
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
        state.error = '這首曲目未確認開始播放，已保留在待播。';
        return false;
      }
      if (!(await finish(active, 'completed'))) return false;
      return state.continuous && state.engaged ? nextItem() : true;
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
        state.error = '曲目在開始前已變更，請重新加入或播放。';
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
          event.reason === 'error'
            ? '播放中斷，請檢查音檔後重新加入待播。'
            : null;
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
    start: (itemId) => enqueue(() => startItem(itemId)),
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
      if (!canStart.value) return Promise.resolve(false);
      cancelPendingStart();
      return enqueue(async () => (await stopItem('interrupted')) && nextItem());
    },
    previous: () => {
      if (request && !request.manual) return player.restartTrack();
    },
    complete: () =>
      enqueue(async () => {
        if (!request?.confirmation) return false;
        if (!(await stopItem('completed'))) return false;
        return state.continuous && state.engaged ? nextItem() : true;
      }),
    stop: () => {
      cancelPendingStart();
      return enqueue(() => stopItem('interrupted'));
    },
    skip: (itemId) => enqueue(() => plan.setProgress(itemId, 'skipped')),
    handleEnded,
    setContinuous: (value) => {
      state.continuous = value === true;
    },
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
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
  };
}

import { computed, reactive, readonly, watch } from 'vue';

export function createBgmSessionController({
  plan,
  library,
  obs,
  player,
  deck,
  coordinator,
  projector,
}) {
  const state = reactive({
    isInitialized: false,
    error: null,
  });
  const currentTrack = computed(() => {
    const trackId = plan.state.plan.currentTrackId;
    if (!trackId) return null;
    return (
      library.tracksById?.value?.get(trackId) ??
      library.state.tracks.find((track) => track.id === trackId) ??
      null
    );
  });
  const settings = computed(() => plan.state.plan.settings);
  const sessionIndicators = computed(() => {
    const observed = obs.state.observed;
    const isReady = observed?.lifecycle === 'ready';
    return {
      isLive: isReady && observed?.streaming?.active === true,
      isRecording: isReady && observed?.recording?.active === true,
      isReconnecting: coordinator.state.sessionMode === 'reconnecting',
    };
  });

  let initializationPromise = null;
  let loadedTrackId = null;
  let loadedUrl = null;
  let requestedTrackId = null;
  let requestedUrl = null;
  let sessionModeUpdates = Promise.resolve();
  let sourceUpdates = Promise.resolve();
  const stopWatchers = [];
  const unsubscribePlayer = [];

  function syncDeckSettings() {
    deck.configure(plan.state.plan.settings);
  }

  function syncDeckSource() {
    const track = currentTrack.value;
    const trackId = track?.id ?? null;
    const url = track?.url ?? null;
    const matchesRequestedSource =
      trackId === requestedTrackId && url === requestedUrl;
    const matchesSettledSource =
      requestedTrackId === null &&
      trackId === loadedTrackId &&
      url === loadedUrl;
    if (matchesRequestedSource || matchesSettledSource) {
      return sourceUpdates;
    }

    requestedTrackId = trackId;
    requestedUrl = url;
    const update = coordinator.replaceBgmSource(() => {
      deck.load(url ?? '', {
        ...plan.state.plan.settings,
        positionSeconds: track ? plan.state.plan.positionSeconds : 0,
      });
      loadedTrackId = trackId;
      loadedUrl = url;
    });
    sourceUpdates = update.then((completed) => {
      if (requestedTrackId === trackId && requestedUrl === url) {
        requestedTrackId = null;
        requestedUrl = null;
      }
      return completed;
    });
    return sourceUpdates;
  }

  function queueSessionModeProjection(observed) {
    const mode = projector.update(observed);
    sessionModeUpdates = sessionModeUpdates.then(() =>
      coordinator.updateSessionMode(mode),
    );
    return sessionModeUpdates;
  }

  function subscribe() {
    if (stopWatchers.length > 0) return;

    stopWatchers.push(
      watch(() => plan.state.plan.settings, syncDeckSettings, {
        deep: true,
        immediate: true,
      }),
      watch(
        [
          () => plan.state.plan.currentTrackId,
          () => currentTrack.value?.url ?? null,
        ],
        syncDeckSource,
        { immediate: true },
      ),
      // Only these fields drive the projector; OBS pushes a new `observed`
      // object on every status tick (timecodes included).
      watch(
        () => [
          obs.state.observed?.lifecycle,
          obs.state.observed?.streaming?.active,
          obs.state.observed?.recording?.active,
        ],
        () => queueSessionModeProjection(obs.state.observed),
        { immediate: true },
      ),
      watch(
        () => deck.state.playbackPhase,
        (phase) => {
          if (phase === 'error' || phase === 'ended') {
            coordinator.notifyBgmTerminated(phase);
          }
        },
      ),
    );

    unsubscribePlayer.push(
      player.registerBeforePlaybackStart(() =>
        coordinator.beforePerformanceStart(),
      ),
      player.onPlaying(() => coordinator.notifyPerformancePlaying()),
      player.onPaused(() => coordinator.notifyPerformanceInterrupted('pause')),
      player.onEnded(() => coordinator.notifyPerformanceEnded()),
      player.onStopped(() => coordinator.notifyPerformanceEnded()),
    );
  }

  function initialize() {
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      // Install the one performance-player safety gate synchronously. Slow
      // disk or OBS restoration must never leave an early play request able
      // to bypass BGM arbitration.
      subscribe();
      await Promise.all([
        plan.initialize(),
        library.initialize(),
        obs.refreshObsStatus(),
      ]);
      await Promise.all([sessionModeUpdates, sourceUpdates]);
      state.isInitialized = true;
      state.error = null;
      return true;
    })().catch(() => {
      state.error = 'BGM 現場控制初始化失敗。';
      return false;
    });
    return initializationPromise;
  }

  async function playBgm() {
    syncDeckSource();
    await sourceUpdates;
    return coordinator.requestBgmPlay();
  }

  async function persistCurrentPosition() {
    const trackId = plan.state.plan.currentTrackId;
    if (!trackId) return false;
    return plan.updatePosition(trackId, deck.state.currentTime);
  }

  function seekBgm(positionSeconds) {
    return deck.seek(positionSeconds);
  }

  function commitBgmPosition() {
    return persistCurrentPosition();
  }

  async function pauseBgm() {
    const result = await coordinator.requestBgmPause();
    await persistCurrentPosition();
    return result;
  }

  async function emergencyCut() {
    const result = await coordinator.requestBgmPause({ immediate: true });
    await persistCurrentPosition();
    return result;
  }

  function setDimmed(isDimmed) {
    deck.setDimmed(isDimmed);
  }

  async function setVolume(volume) {
    deck.setVolume(volume);
    return plan.updateSettings({ volume });
  }

  function previewVolume(volume) {
    deck.setVolume(volume);
  }

  async function setMuted(isMuted) {
    const updated = await plan.updateSettings({ isMuted });
    if (updated) deck.setMuted(isMuted);
    return updated;
  }

  async function dispose() {
    stopWatchers.splice(0).forEach((stop) => stop());
    unsubscribePlayer.splice(0).forEach((unsubscribe) => unsubscribe());
    coordinator.dispose();
    await deck.dispose();
  }

  return {
    state: readonly(state),
    handoffState: readonly(coordinator.state),
    deckState: readonly(deck.state),
    currentTrack,
    settings,
    sessionIndicators,
    initialize,
    playBgm,
    pauseBgm,
    emergencyCut,
    seekBgm,
    commitBgmPosition,
    setDimmed,
    previewVolume,
    setVolume,
    setMuted,
    dispose,
  };
}

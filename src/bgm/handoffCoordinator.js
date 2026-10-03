const ACTIVE_SESSION_MODES = new Set(['live', 'record', 'reconnecting']);

const DEFAULT_SETTINGS = Object.freeze({
  fadeInSeconds: 1,
  fadeOutSeconds: 0.6,
  preRollSeconds: 0.75,
  postRollSeconds: 1,
});

function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function finiteDuration(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function createBgmHandoffCoordinator({
  deck,
  getSettings,
  now = () => performance.now(),
  wait = defaultWait,
  state: suppliedState,
}) {
  const state = suppliedState ?? {};
  Object.assign(state, {
    sessionMode: state.sessionMode ?? 'inactive',
    phase: state.phase ?? 'idle',
    audibleLane: state.audibleLane ?? null,
    bgmRequested: state.bgmRequested ?? false,
    restorePending: state.restorePending ?? false,
    error: state.error ?? null,
  });

  let generation = 0;
  let performanceActive = false;
  let performancePaused = false;
  let performanceHandoffPending = false;
  let activePerformanceStop = null;
  let deferredSourceReplacement = null;
  let disposed = false;

  function isCurrent(candidate) {
    return !disposed && candidate === generation;
  }

  function nextGeneration() {
    generation += 1;
    return generation;
  }

  function deferSourceReplacement(replaceSource) {
    deferredSourceReplacement?.resolve(false);
    return new Promise((resolve) => {
      deferredSourceReplacement = { replaceSource, resolve };
    });
  }

  async function flushDeferredSourceReplacement() {
    let completed = true;
    while (deferredSourceReplacement) {
      const pending = deferredSourceReplacement;
      deferredSourceReplacement = null;
      try {
        await pending.replaceSource();
        pending.resolve(true);
      } catch {
        pending.resolve(false);
        completed = false;
      }
    }
    return completed;
  }

  function discardDeferredSourceReplacement() {
    deferredSourceReplacement?.resolve(false);
    deferredSourceReplacement = null;
  }

  function snapshotSettings() {
    const settings = getSettings?.() ?? {};
    return {
      fadeInSeconds: finiteDuration(
        settings.fadeInSeconds,
        DEFAULT_SETTINGS.fadeInSeconds,
      ),
      fadeOutSeconds: finiteDuration(
        settings.fadeOutSeconds,
        DEFAULT_SETTINGS.fadeOutSeconds,
      ),
      preRollSeconds: finiteDuration(
        settings.preRollSeconds,
        DEFAULT_SETTINGS.preRollSeconds,
      ),
      postRollSeconds: finiteDuration(
        settings.postRollSeconds,
        DEFAULT_SETTINGS.postRollSeconds,
      ),
    };
  }

  async function waitUntil(deadline, candidate) {
    while (isCurrent(candidate)) {
      const remaining = deadline - now();
      if (remaining <= 0) return true;
      await wait(remaining);
    }
    return false;
  }

  async function startRequestedBgm(candidate, settings) {
    if (
      !isCurrent(candidate) ||
      !state.bgmRequested ||
      performanceActive ||
      !deck.hasSource()
    ) {
      return false;
    }

    state.phase = 'bgm-playing';
    state.restorePending = false;
    state.audibleLane = null;
    const didStart = await deck.playFromZero();
    if (!didStart || !isCurrent(candidate)) return false;

    state.audibleLane = 'bgm';
    const didFade = await deck.fadeIn(settings.fadeInSeconds);
    if (!didFade || !isCurrent(candidate)) return false;

    state.phase = 'bgm-playing';
    state.audibleLane = 'bgm';
    return true;
  }

  async function updateSessionMode(mode) {
    const nextMode = ACTIVE_SESSION_MODES.has(mode) ? mode : 'inactive';
    const previousMode = state.sessionMode;
    state.sessionMode = nextMode;

    if (nextMode !== 'inactive') return true;
    if (!ACTIVE_SESSION_MODES.has(previousMode)) return true;

    const candidate = nextGeneration();
    const settings = snapshotSettings();
    state.bgmRequested = false;
    state.restorePending = false;
    performancePaused = false;
    performanceHandoffPending = false;
    activePerformanceStop?.resolve(false);
    activePerformanceStop = null;

    if (!performanceActive) {
      await deck.fadeOutAndPause(settings.fadeOutSeconds);
    }
    if (!isCurrent(candidate)) return false;

    await flushDeferredSourceReplacement();
    if (!isCurrent(candidate)) return false;

    state.audibleLane = performanceActive ? 'performance' : null;
    state.phase = performanceActive ? 'track-active' : 'idle';
    state.error = null;
    return true;
  }

  async function requestBgmPlay() {
    state.error = null;

    if (
      performanceActive ||
      performanceHandoffPending ||
      state.phase === 'postroll-silence'
    ) {
      state.bgmRequested = false;
      state.restorePending = true;
      return true;
    }

    const candidate = nextGeneration();
    state.bgmRequested = true;
    state.restorePending = false;
    if (!deck.hasSource()) {
      state.bgmRequested = false;
      state.phase = 'error';
      state.error = '尚未選擇可播放的 BGM。';
      return false;
    }

    return startRequestedBgm(candidate, snapshotSettings());
  }

  async function requestBgmPause({ immediate = false } = {}) {
    state.bgmRequested = false;
    state.restorePending = false;
    state.error = null;

    if (performanceActive || performanceHandoffPending) {
      if (immediate) {
        deck.cut();
        activePerformanceStop?.resolve(true);
      }
      return true;
    }

    const candidate = nextGeneration();
    state.phase = 'stopping-bgm';

    if (immediate) deck.cut();
    else await deck.fadeOutAndPause(snapshotSettings().fadeOutSeconds);

    if (!isCurrent(candidate)) return false;
    state.audibleLane = null;
    state.phase = 'manual-hold';
    return true;
  }

  async function beforePerformanceStart() {
    const needsHandoff =
      !performanceActive &&
      (state.bgmRequested ||
        state.audibleLane === 'bgm' ||
        state.phase === 'stopping-bgm' ||
        performanceHandoffPending ||
        (!performancePaused && state.restorePending));
    if (!needsHandoff) return true;

    const candidate = nextGeneration();
    const settings = snapshotSettings();
    performanceHandoffPending = true;
    state.restorePending =
      state.restorePending || state.bgmRequested || state.audibleLane === 'bgm';
    state.bgmRequested = false;
    state.phase = 'stopping-bgm';
    state.error = null;

    let resolveStop;
    const stopOverride = new Promise((resolve) => {
      resolveStop = resolve;
    });
    const stopAttempt = { resolve: resolveStop };
    activePerformanceStop?.resolve(false);
    activePerformanceStop = stopAttempt;
    const didStop = await Promise.race([
      deck.fadeOutAndPause(settings.fadeOutSeconds),
      stopOverride,
    ]);
    if (activePerformanceStop === stopAttempt) activePerformanceStop = null;
    if (!didStop || !isCurrent(candidate)) {
      if (isCurrent(candidate)) {
        performanceHandoffPending = false;
        discardDeferredSourceReplacement();
      }
      return false;
    }

    state.audibleLane = null;
    await flushDeferredSourceReplacement();
    if (!isCurrent(candidate)) return false;
    state.phase = 'track-preroll';
    const deadline = now() + settings.preRollSeconds * 1000;
    return waitUntil(deadline, candidate);
  }

  async function replaceBgmSource(replaceSource) {
    if (performanceHandoffPending && state.phase === 'stopping-bgm') {
      return deferSourceReplacement(replaceSource);
    }

    if (performanceActive || performanceHandoffPending) {
      await replaceSource();
      return true;
    }

    if (state.phase === 'postroll-silence') {
      await replaceSource();
      return true;
    }

    const candidate = nextGeneration();
    const settings = snapshotSettings();
    const shouldResume = state.bgmRequested && !performanceActive;

    if (shouldResume) {
      state.phase = 'stopping-bgm';
      const didStop = await deck.fadeOutAndPause(settings.fadeOutSeconds);
      if (!didStop || !isCurrent(candidate)) return false;
      state.audibleLane = null;
    }

    await replaceSource();
    if (!isCurrent(candidate)) return false;
    if (!shouldResume) return true;
    return startRequestedBgm(candidate, settings);
  }

  function notifyPerformancePlaying() {
    performanceHandoffPending = false;
    activePerformanceStop = null;
    performanceActive = true;
    performancePaused = false;
    state.bgmRequested = false;
    state.phase = 'track-active';
    state.audibleLane = 'performance';
    state.error = null;
  }

  function notifyPerformanceInterrupted(reason) {
    const performanceOwnsStart = performanceActive || performanceHandoffPending;
    if (reason !== 'pause' || !performanceOwnsStart) {
      // Buffering, seeking and stalled states can recover without another
      // operator action, so they retain the performance-lane lock.
      return performanceOwnsStart;
    }

    if (performanceHandoffPending) nextGeneration();
    performanceHandoffPending = false;
    activePerformanceStop?.resolve(false);
    activePerformanceStop = null;
    performanceActive = false;
    performancePaused = true;
    state.bgmRequested = false;
    state.phase = 'track-paused';
    state.audibleLane = null;
    state.error = null;
    return true;
  }

  async function notifyPerformanceEnded() {
    const wasPerformanceActive = performanceActive;
    const wasPerformancePaused = performancePaused;
    if (!wasPerformanceActive && state.phase === 'postroll-silence') {
      return false;
    }
    performanceHandoffPending = false;
    activePerformanceStop = null;
    performanceActive = false;
    performancePaused = false;

    if (
      !wasPerformanceActive &&
      wasPerformancePaused &&
      state.bgmRequested &&
      state.audibleLane === 'bgm'
    ) {
      return true;
    }

    state.bgmRequested = false;

    if (!state.restorePending) {
      state.phase = 'manual-hold';
      state.audibleLane = null;
      return false;
    }

    const candidate = nextGeneration();
    const settings = snapshotSettings();
    if (!wasPerformanceActive) {
      state.audibleLane = null;
      state.restorePending = false;
      state.bgmRequested = true;
      return startRequestedBgm(candidate, settings);
    }

    state.phase = 'postroll-silence';
    state.audibleLane = null;
    const deadline = now() + settings.postRollSeconds * 1000;
    const completed = await waitUntil(deadline, candidate);
    if (!completed) return false;

    state.restorePending = false;
    state.bgmRequested = true;
    return startRequestedBgm(candidate, settings);
  }

  function notifyBgmTerminated(reason) {
    if (state.phase !== 'bgm-playing') {
      return false;
    }
    nextGeneration();
    state.bgmRequested = false;
    state.restorePending = false;
    state.audibleLane = null;
    state.error = reason === 'error' ? 'BGM 音訊無法播放。' : null;
    state.phase = reason === 'error' ? 'error' : 'manual-hold';
    return true;
  }

  function dispose() {
    disposed = true;
    nextGeneration();
    performancePaused = false;
    performanceHandoffPending = false;
    activePerformanceStop?.resolve(false);
    activePerformanceStop = null;
    discardDeferredSourceReplacement();
    state.bgmRequested = false;
    state.restorePending = false;
    state.audibleLane = null;
  }

  return {
    state,
    updateSessionMode,
    requestBgmPlay,
    requestBgmPause,
    replaceBgmSource,
    beforePerformanceStart,
    notifyPerformancePlaying,
    notifyPerformanceInterrupted,
    notifyPerformanceEnded,
    notifyBgmTerminated,
    dispose,
  };
}

import { reactive, readonly } from 'vue';

// One practice session, consuming the original player's media boundary and DSP.
export function usePlayerPracticeRuntime({
  player,
  acquireHold,
  isSessionOwned = () => false,
  verifySource = async () => true,
  now = () => globalThis.performance.now(),
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  visibility = globalThis.document ?? null,
  measure: suppliedMeasure = () => {},
}) {
  const boundary = player.practiceBoundary;
  const measurementListeners = new Set();
  const measure = (value) => {
    suppliedMeasure(value);
    measurementListeners.forEach((listener) => listener(value));
  };
  const state = reactive({
    a: null,
    b: null,
    gapSeconds: 2,
    enabled: false,
    phase: 'idle',
    error: null,
    laps: 0,
    metadataRevision: 0,
    loading: false,
    waitingSeconds: 0,
  });
  let generation = 0,
    context = null,
    timer = null,
    pendingSeek = null,
    hold = null,
    activeToken = null,
    pendingAuto = null,
    disposed = false,
    lastObservation = null;
  const sameSource = (sample) =>
    context &&
    sample.trackId === context.trackId &&
    sample.playbackRevision === context.playbackRevision &&
    sample.sourceRevision === context.sourceRevision;
  const current = (token) =>
    !disposed &&
    state.enabled &&
    token === activeToken &&
    token.generation === generation &&
    sameSource(boundary.sample());
  const token = () => (activeToken = { generation: ++generation });
  function cancelWork() {
    generation++;
    activeToken = null;
    if (timer !== null) clearTimer(timer);
    timer = null;
    pendingSeek?.finish(false);
    pendingSeek = null;
  }
  function valid(sample = boundary.sample()) {
    return (
      sample.local &&
      sample.trackId &&
      Number.isFinite(sample.duration) &&
      sample.duration > 0 &&
      Number.isFinite(state.a) &&
      Number.isFinite(state.b) &&
      state.a >= 0 &&
      state.b <= sample.duration &&
      state.b - state.a >= 0.5 &&
      sample.seekable.some(([start, end]) => start <= state.a && end >= state.b)
    );
  }
  const inside = (sample) =>
    sample.currentTime >= state.a && sample.currentTime < state.b;
  function disable({ clear = false } = {}) {
    cancelWork();
    state.enabled = false;
    state.phase = 'idle';
    state.error = null;
    hold?.release();
    hold = null;
    boundary.suppressNativeLoop(false);
    if (clear) {
      state.a = null;
      state.b = null;
      state.laps = 0;
    }
  }
  function block(reason) {
    const sample = boundary.sample();
    if (
      !context ||
      sample.trackId !== context.trackId ||
      sample.playbackRevision !== context.playbackRevision
    ) {
      disable({ clear: true });
      return;
    }
    cancelWork();
    state.phase = 'blocked';
    state.error = reason;
    const operation = token();
    boundary.pauseForReturn(
      operation,
      () =>
        state.enabled &&
        operation === activeToken &&
        operation.generation === generation,
    );
  }
  function poll() {
    if (!state.enabled || disposed || state.phase !== 'armed') return;
    const sample = boundary.sample();
    const observation = now();
    if (lastObservation !== null && observation - lastObservation > 1000) {
      block('interrupted');
      return;
    }
    lastObservation = observation;
    if (!sameSource(sample) || !valid(sample)) {
      block('source-or-range');
      return;
    }
    if (sample.paused) return;
    if (sample.currentTime >= state.b) {
      void returnToA();
      return;
    }
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      poll();
    }, 16);
  }
  async function seekA(operation, position = state.a) {
    if (!current(operation)) return false;
    const started = now();
    const result = await new Promise((resolve) => {
      let deadline;
      const pending = {
        operation,
        finish(ok) {
          if (pendingSeek !== pending) return;
          clearTimer(deadline);
          pendingSeek = null;
          resolve(ok);
        },
      };
      pendingSeek = pending;
      deadline = setTimer(() => pending.finish(false), 10_000);
      try {
        player.seek(position, operation);
      } catch {
        pending.finish(false);
      }
    });
    if (!current(operation)) return false;
    const sample = boundary.sample(),
      landingMs = Math.abs(sample.currentTime - position) * 1000;
    measure({
      kind: 'seek',
      seekMs: now() - started,
      landingMs,
      ok: Boolean(result && landingMs <= 150),
      rate: sample.rate,
    });
    if (!result || landingMs > 150 || now() - started > 10_000) {
      block('seek');
      return false;
    }
    return true;
  }
  async function resume(operation) {
    if (!current(operation)) return false;
    const attempt = { operation, replacedByPlay: false, started: now() };
    pendingAuto = attempt;
    try {
      const result = await player.play({ practiceToken: operation });
      if (!current(operation)) {
        if (!attempt.replacedByPlay && sameSource(boundary.sample()))
          player.pause();
        return false;
      }
      if (!result) block('play');
      return Boolean(result && current(operation));
    } catch {
      if (current(operation)) block('play');
      return false;
    } finally {
      if (pendingAuto === attempt) pendingAuto = null;
      if (disposed) releaseSubscriptions();
    }
  }
  async function returnToA() {
    if (!state.enabled || state.phase !== 'armed') return;
    const sample = boundary.sample();
    if (!valid(sample) || !sameSource(sample)) {
      block('source-or-range');
      return;
    }
    const gap = state.gapSeconds,
      operation = token();
    state.phase = 'returning';
    measure({
      kind: 'boundary',
      overshootMs: Math.max(0, sample.currentTime - state.b) * 1000,
      rate: sample.rate,
    });
    boundary.pauseForReturn(operation, () => current(operation));
    if (!(await seekA(operation))) return;
    state.phase = 'gap';
    state.waitingSeconds = gap;
    const deadline = now() + gap * 1000;
    const tick = () => {
      if (!current(operation)) return;
      const remaining = deadline - now();
      if (remaining < -1000) {
        block('interrupted');
        return;
      }
      if (remaining > 0) {
        timer = setTimer(tick, remaining);
        return;
      }
      timer = null;
      measure({
        kind: 'gap',
        gapSeconds: gap,
        elapsedMs: now() - (deadline - gap * 1000),
        earlyByMs: Math.max(0, deadline - now()),
      });
      void resume(operation);
    };
    timer = setTimer(tick, gap * 1000);
  }
  function onIntent(kind, operation, value) {
    if (
      operation &&
      operation === activeToken &&
      operation.generation === generation
    )
      return;
    if (kind === 'play' && pendingAuto) pendingAuto.replacedByPlay = true;
    if (['replace', 'restore', 'restart', 'clear', 'dispose'].includes(kind)) {
      disable({ clear: true });
      return;
    }
    if (!state.enabled) {
      if (state.loading) cancelWork();
      return;
    }
    if (kind === 'source-missing') {
      invalidateSource();
      return;
    }
    if (
      kind === 'mode' ||
      (kind === 'seek' && !(value >= state.a && value < state.b))
    ) {
      disable();
      return;
    }
    cancelWork();
    state.phase = 'armed';
    if (kind === 'seek') globalThis.queueMicrotask(poll);
  }
  async function preparePlay() {
    onIntent('play');
    lastObservation = null;
    if (!state.enabled || disposed) return false;
    if (!valid() || !sameSource(boundary.sample())) {
      block('source-or-range');
      return false;
    }
    const request = token();
    state.error = null;
    if (!inside(boundary.sample())) {
      state.phase = 'returning';
      if (!(await seekA(request))) return false;
    }
    if (!current(request)) return false;
    state.phase = 'armed';
    return request;
  }
  async function beforePlay(operation) {
    if (operation) return current(operation);
    if (!state.enabled || disposed) {
      onIntent('play');
      lastObservation = null;
      return true;
    }
    return Boolean(await preparePlay());
  }
  async function startPractice() {
    const operation = await preparePlay();
    return operation ? resume(operation) : false;
  }
  function invalidateSource() {
    block('source-or-range');
    state.enabled = false;
    hold?.release();
    hold = null;
    boundary.suppressNativeLoop(false);
  }
  async function verifyMetadata(verify) {
    if (!state.enabled) return true;
    const revision = generation;
    const equivalent = await verify();
    if (generation !== revision) return false;
    if (!equivalent) invalidateSource();
    return equivalent;
  }
  async function prepareSourceChange(verify) {
    if (!state.enabled) return null;
    const before = boundary.sample(),
      resume = !before.paused && state.phase === 'armed';
    cancelWork();
    const operation = token();
    state.phase = 'source-changing';
    boundary.pauseForReturn(operation, () => current(operation));
    const equivalent = await verify();
    if (!current(operation)) return { cancelled: true };
    return {
      operation,
      equivalent,
      resume,
      position: before.currentTime,
      duration: before.duration,
      verify,
    };
  }
  async function completeSourceChange(ticket) {
    if (!ticket || ticket.cancelled || ticket.operation !== activeToken)
      return false;
    if (!ticket.equivalent) {
      invalidateSource();
      return false;
    }
    context = boundary.sample();
    const ready = () => boundary.sample().readyState >= 1 && valid();
    if (!ready()) {
      const found = await new Promise((resolve) => {
        let timeout;
        const pending = {
          operation: ticket.operation,
          ready,
          finish(ok) {
            if (pendingSeek !== pending) return;
            clearTimer(timeout);
            pendingSeek = null;
            resolve(ok);
          },
        };
        pendingSeek = pending;
        timeout = setTimer(() => pending.finish(false), 10_000);
      });
      if (!current(ticket.operation)) return false;
      if (!found) {
        invalidateSource();
        return false;
      }
    }
    if (Math.abs(boundary.sample().duration - ticket.duration) > 0.05) {
      invalidateSource();
      return false;
    }
    if (!(await seekA(ticket.operation, ticket.position))) return false;
    const stillEquivalent = await ticket.verify();
    if (!current(ticket.operation)) return false;
    if (!stillEquivalent) {
      invalidateSource();
      return false;
    }
    state.phase = 'armed';
    state.error = null;
    return ticket.resume;
  }
  const detach = boundary.attach({
    onIntent,
    beforePlay,
    prepareSourceChange,
    completeSourceChange,
    verifyMetadata,
    decideEnded(sample) {
      if (!state.enabled) return 'final';
      if (!sameSource(sample) || !valid(sample)) {
        block('source-or-range');
        return 'blocked';
      }
      if (!sample.ended) return 'ignore';
      if (state.phase === 'armed') void returnToA();
      return 'return';
    },
  });
  const unsubscribe = boundary.onNativeEvent((event) => {
    if (['loadedmetadata', 'durationchange', 'canplay'].includes(event.type))
      state.metadataRevision++;
    if (state.phase === 'blocked' && event.type !== 'play') return;
    if (
      event.type === 'play' &&
      pendingAuto &&
      !current(pendingAuto.operation) &&
      !pendingAuto.replacedByPlay &&
      sameSource(event)
    )
      player.pause();
    if (!state.enabled) return;
    if (state.phase === 'source-changing') {
      if (pendingSeek?.ready && pendingSeek.ready()) pendingSeek.finish(true);
      if (event.type !== 'seeked' || pendingSeek?.ready) return;
    }
    if (!sameSource(event)) {
      block('source-or-range');
      return;
    }
    if (event.type === 'error') {
      block('media');
      return;
    }
    if (
      event.type === 'seeked' &&
      pendingSeek &&
      current(pendingSeek.operation)
    )
      pendingSeek.finish(!event.seeking);
    if (event.type === 'playing') {
      lastObservation = now();
      if (state.phase === 'gap' && activeToken) {
        state.laps++;
        measure({
          kind: 'playing',
          at: now(),
          startupMs: pendingAuto ? now() - pendingAuto.started : null,
        });
      }
      state.phase = 'armed';
      poll();
    }
    if (event.type === 'timeupdate') poll();
  });
  const visibilityChanged = () => {
    if (state.enabled && visibility?.hidden) player.pause();
  };
  visibility?.addEventListener('visibilitychange', visibilityChanged);
  const releaseSubscriptions = () => {
    detach();
    unsubscribe();
  };
  return {
    state: readonly(state),
    isRangeValid: () => Boolean(valid()),
    onMeasurement(listener) {
      measurementListeners.add(listener);
      return () => measurementListeners.delete(listener);
    },
    setRange(a, b) {
      disable();
      state.a = a;
      state.b = b;
      return Boolean(valid());
    },
    setGap(seconds) {
      if (![0, 1, 2, 4].includes(seconds)) return false;
      state.gapSeconds = seconds;
      return true;
    },
    async enable({ startPlayback = false } = {}) {
      if (
        disposed ||
        state.loading ||
        visibility?.hidden ||
        isSessionOwned() ||
        player.state.pendingStartTrackId ||
        !valid()
      )
        return false;
      if (state.enabled)
        return startPlayback && boundary.sample().paused
          ? startPractice()
          : true;
      const verifying = generation;
      state.loading = true;
      let proof;
      try {
        proof = await verifySource();
      } catch {
        proof = false;
      } finally {
        state.loading = false;
      }
      if (
        verifying !== generation ||
        disposed ||
        visibility?.hidden ||
        isSessionOwned() ||
        player.state.pendingStartTrackId ||
        !valid()
      )
        return false;
      if (!proof) {
        state.error = 'source-or-range';
        state.phase = 'blocked';
        return false;
      }
      context = boundary.sample();
      hold = acquireHold({
        onPreempt() {
          disable();
          player.pause();
        },
      });
      if (!hold) {
        state.error = 'busy';
        state.phase = 'blocked';
        return false;
      }
      state.enabled = true;
      state.phase = 'armed';
      state.error = null;
      let operation = token();
      lastObservation = null;
      boundary.suppressNativeLoop(true);
      if (!boundary.sample().paused && !inside(boundary.sample())) {
        operation = token();
        state.phase = 'returning';
        boundary.pauseForReturn(operation, () => current(operation));
        if (!(await seekA(operation))) return false;
        state.phase = 'gap';
        await resume(operation);
      } else poll();
      const ready = current(operation) && state.phase !== 'blocked';
      if (ready && startPlayback && boundary.sample().paused)
        return startPractice();
      return ready;
    },
    disable,
    dispose() {
      disable({ clear: true });
      disposed = true;
      measurementListeners.clear();
      if (pendingAuto) player.pause();
      else releaseSubscriptions();
      visibility?.removeEventListener('visibilitychange', visibilityChanged);
    },
  };
}

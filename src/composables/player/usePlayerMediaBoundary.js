// Native media events remain authoritative. This boundary classifies EOF before
// terminal consumers and correlates an internal pause with its live lap token.
export function usePlayerMediaBoundary({
  audio,
  state,
  onTerminal,
  onPlaying,
  cancelStart,
  flushProgress = () => {},
}) {
  const listeners = {
    ended: new Set(),
    paused: new Set(),
    playing: new Set(),
    native: new Set(),
  };
  let controller = null,
    pauseRequest = null,
    source = audio.src,
    sourceRevision = 0,
    consumedEnded = null;
  const identity = () =>
    state.track
      ? { trackId: state.track.id, playbackRevision: state.playbackRevision }
      : null;
  function sample() {
    if (source !== audio.src) {
      source = audio.src;
      sourceRevision++;
    }
    const seekable = [];
    for (let i = 0; i < (audio.seekable?.length ?? 0); i++)
      seekable.push([audio.seekable.start(i), audio.seekable.end(i)]);
    return {
      ...identity(),
      sourceRevision,
      currentTime: audio.currentTime,
      duration: audio.duration,
      paused: audio.paused,
      ended: audio.ended,
      seeking: audio.seeking,
      readyState: audio.readyState,
      rate: audio.playbackRate,
      local: audio.src?.startsWith('utawakui-media:') === true,
      seekable,
    };
  }
  const publish = (kind, value) =>
    listeners[kind].forEach((listener) => listener(value));
  const subscribe = (kind, listener) => {
    listeners[kind].add(listener);
    return () => listeners[kind].delete(listener);
  };
  function handlePause() {
    state.isPlaying = false;
    state.currentTime = audio.currentTime || 0;
    if (audio.ended) return;
    state.playbackPhase = state.track ? 'paused' : 'idle';
    const event = identity(),
      pending = pauseRequest;
    pauseRequest = null;
    if (!event) return;
    const current = sample();
    publish(
      'paused',
      pending &&
        pending.isCurrent() &&
        pending.trackId === event.trackId &&
        pending.playbackRevision === event.playbackRevision &&
        pending.sourceRevision === current.sourceRevision
        ? { ...event, reason: 'practice-return', lapToken: pending.token }
        : event,
    );
  }
  function handlePlaying() {
    consumedEnded = null;
    onPlaying();
    state.currentTime = audio.currentTime || 0;
    state.playbackPhase = 'playing';
    if (state.track) publish('playing', identity());
  }
  function handleEnded() {
    if (
      audio.ended === false ||
      (audio.currentSrc && audio.src && audio.currentSrc !== audio.src)
    )
      return;
    const event = sample();
    if (
      consumedEnded &&
      ['trackId', 'playbackRevision', 'sourceRevision'].every(
        (key) => consumedEnded[key] === event[key],
      )
    )
      return;
    flushProgress();
    state.isPlaying = false;
    state.currentTime = audio.currentTime || state.currentTime;
    let decision;
    try {
      decision = controller?.decideEnded?.(sample()) ?? 'final';
    } catch {
      decision = 'blocked';
    }
    if (!['final', 'return', 'blocked', 'ignore'].includes(decision)) {
      Promise.resolve(decision).catch(() => {});
      decision = 'blocked';
    }
    if (decision !== 'final') {
      consumedEnded = event;
      state.playbackPhase = state.track ? 'paused' : 'idle';
      if (decision === 'blocked') audio.pause();
      return;
    }
    state.playbackPhase = 'ended';
    onTerminal();
    publish('ended', identity());
  }
  const handlers = {
    pause: handlePause,
    playing: handlePlaying,
    ended: handleEnded,
  };
  for (const [event, handler] of Object.entries(handlers))
    audio.addEventListener(event, handler);
  const nativeEvents = [
    'play',
    'playing',
    'pause',
    'ended',
    'timeupdate',
    'seeking',
    'seeked',
    'loadedmetadata',
    'durationchange',
    'canplay',
    'error',
  ];
  const observe = (event) => {
    if (listeners.native.size)
      publish('native', { type: event.type, ...sample() });
  };
  nativeEvents.forEach((event) => audio.addEventListener(event, observe));
  return {
    sample,
    prepareSourceChange: (verify) =>
      controller?.prepareSourceChange?.(verify) ?? null,
    completeSourceChange: (ticket) =>
      controller?.completeSourceChange?.(ticket) ?? true,
    verifyMetadata: (verify) => controller?.verifyMetadata?.(verify) ?? true,
    suppressNativeLoop(on) {
      audio.loop = !on && state.playbackMode === 'repeat-one';
      state.isLooping = audio.loop;
    },
    attach(next) {
      if (controller) throw new Error('Player media boundary already owned');
      controller = next;
      return () => {
        if (controller === next) {
          controller = null;
          pauseRequest = null;
        }
      };
    },
    intent(kind, token, value) {
      if (!token) pauseRequest = null;
      controller?.onIntent?.(kind, token, value);
    },
    async beforePlay(token) {
      try {
        return (await controller?.beforePlay?.(token)) !== false;
      } catch {
        return false;
      }
    },
    pauseForReturn(token, isCurrent) {
      if (!token || !isCurrent()) return false;
      flushProgress();
      pauseRequest = { ...sample(), token, isCurrent };
      cancelStart(token);
      audio.pause();
      return true;
    },
    onEnded: (listener) => subscribe('ended', listener),
    onPaused: (listener) => subscribe('paused', listener),
    onPlaying: (listener) => subscribe('playing', listener),
    onNativeEvent: (listener) => subscribe('native', listener),
    dispose() {
      controller?.onIntent?.('dispose');
      controller = null;
      pauseRequest = null;
      for (const [event, handler] of Object.entries(handlers))
        audio.removeEventListener(event, handler);
      nativeEvents.forEach((event) =>
        audio.removeEventListener(event, observe),
      );
      Object.values(listeners).forEach((set) => set.clear());
    },
  };
}

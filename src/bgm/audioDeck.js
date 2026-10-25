import audioControlValues from '../../shared/audioControlValues.json';

const DEFAULT_SETTINGS = Object.freeze({
  volume: audioControlValues.bgmVolume.defaultValue,
  isMuted: audioControlValues.bgmMutedDefault,
  loop: true,
  dimDb: audioControlValues.bgmDimDb.defaultValue,
  dimAttackMs: 100,
  dimReleaseMs: 600,
});

function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function clamp(value, minimum, maximum, fallback) {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

export function createBgmAudioDeck({
  audio = new Audio(),
  createAudioContext = () => new AudioContext(),
  wait = defaultWait,
  state: suppliedState,
  connectCaptureInput,
  prepareCaptureOutput,
} = {}) {
  const state = suppliedState ?? {};
  Object.assign(state, {
    playbackPhase: state.playbackPhase ?? 'idle',
    isPlaying: state.isPlaying ?? false,
    playIntentActive: false,
    currentTime: state.currentTime ?? 0,
    duration: state.duration ?? 0,
    error: state.error ?? null,
    isDimmed: state.isDimmed ?? false,
  });

  let settings = { ...DEFAULT_SETTINGS };
  let context = null;
  let sourceNode = null;
  let gainNode = null;
  let transitionGeneration = 0;
  let pendingPlaying = null;
  let sourceUrl = '';
  let disposed = false;
  let captureBridge = null;
  let captureInput = null;

  audio.crossOrigin = 'anonymous';

  function effectiveGain() {
    if (settings.isMuted) return 0;
    const attenuation = state.isDimmed ? 10 ** (settings.dimDb / 20) : 1;
    return settings.volume * attenuation;
  }

  function ensureGraph() {
    if (!context) {
      context = createAudioContext();
      sourceNode = context.createMediaElementSource(audio);
      gainNode = context.createGain();
      sourceNode.connect(gainNode);
      gainNode.connect(context.destination);
      gainNode.gain.setValueAtTime(0, context.currentTime);
    }
    if (connectCaptureInput && !captureInput) {
      if (!captureBridge) {
        captureBridge = context.createMediaStreamDestination();
        gainNode.connect(captureBridge);
      }
      captureInput = connectCaptureInput(captureBridge.stream, () => {
        if (state.playIntentActive || state.isPlaying) failCapture();
      });
    }
    return context;
  }

  function failCapture() {
    cut();
    state.error = 'BGM 擷取輸出中斷，請重新選擇輸出裝置。';
    state.playbackPhase = 'error';
  }

  function cancelAutomation(value = gainNode?.gain.value ?? 0) {
    if (!gainNode || !context) return;
    gainNode.gain.cancelScheduledValues(context.currentTime);
    gainNode.gain.setValueAtTime(value, context.currentTime);
  }

  function invalidateTransition() {
    transitionGeneration += 1;
    return transitionGeneration;
  }

  function settlePendingPlaying(result) {
    if (!pendingPlaying) return;
    const pending = pendingPlaying;
    pendingPlaying = null;
    pending.resolve(result);
  }

  function handlePlay() {
    state.isPlaying = true;
    state.currentTime = audio.currentTime || 0;
    state.playbackPhase = 'buffering';
  }

  function handlePlaying() {
    if (!state.playIntentActive) {
      cancelAutomation(0);
      audio.pause();
      return;
    }
    state.isPlaying = true;
    state.currentTime = audio.currentTime || 0;
    state.playbackPhase = state.isDimmed ? 'dimmed' : 'playing';
    settlePendingPlaying(true);
  }

  function handlePause() {
    captureInput?.setEnabled(false);
    state.playIntentActive = false;
    state.isPlaying = false;
    state.currentTime = audio.currentTime || 0;
    state.playbackPhase = sourceUrl ? 'paused' : 'idle';
  }

  function handleEnded() {
    captureInput?.setEnabled(false);
    state.isPlaying = false;
    state.currentTime = audio.currentTime || state.currentTime;
    state.playbackPhase = 'ended';
  }

  function handleTimeUpdate() {
    state.currentTime = audio.currentTime || 0;
  }

  function handleLoadedMetadata() {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    state.currentTime = audio.currentTime || 0;
  }

  function handleError() {
    captureInput?.setEnabled(false);
    invalidateTransition();
    state.playIntentActive = false;
    cancelAutomation(0);
    if (!audio.paused) audio.pause();
    state.isPlaying = false;
    state.error = 'BGM 音訊無法播放。';
    state.playbackPhase = 'error';
    settlePendingPlaying(false);
  }

  const listeners = {
    play: handlePlay,
    playing: handlePlaying,
    pause: handlePause,
    ended: handleEnded,
    timeupdate: handleTimeUpdate,
    loadedmetadata: handleLoadedMetadata,
    error: handleError,
  };
  Object.entries(listeners).forEach(([type, listener]) => {
    audio.addEventListener(type, listener);
  });

  function configure(nextSettings = {}) {
    settings = {
      ...settings,
      volume: clamp(
        nextSettings.volume,
        audioControlValues.bgmVolume.min,
        audioControlValues.bgmVolume.max,
        settings.volume,
      ),
      isMuted:
        typeof nextSettings.isMuted === 'boolean'
          ? nextSettings.isMuted
          : settings.isMuted,
      loop: true,
      dimDb: clamp(
        nextSettings.dimDb,
        audioControlValues.bgmDimDb.min,
        audioControlValues.bgmDimDb.max,
        settings.dimDb,
      ),
      dimAttackMs: clamp(
        nextSettings.dimAttackMs,
        20,
        500,
        settings.dimAttackMs,
      ),
      dimReleaseMs: clamp(
        nextSettings.dimReleaseMs,
        100,
        2000,
        settings.dimReleaseMs,
      ),
    };
    audio.loop = true;
    applyLiveGain(0);
    return { ...settings };
  }

  function load(url, options = {}) {
    captureInput?.setEnabled(false);
    invalidateTransition();
    settlePendingPlaying(false);
    state.playIntentActive = false;
    if (!audio.paused) audio.pause();
    sourceUrl = typeof url === 'string' ? url : '';
    state.error = null;
    state.isPlaying = false;
    state.duration = 0;
    configure(options);
    audio.src = sourceUrl;
    audio.currentTime = Math.max(0, Number(options.positionSeconds) || 0);
    state.currentTime = audio.currentTime;
    state.playbackPhase = sourceUrl ? 'paused' : 'idle';
    return Boolean(sourceUrl);
  }

  // Starts playback at zero gain from the current position; fadeIn() brings
  // the level up.
  async function startSilent() {
    if (!sourceUrl || disposed) return false;
    const candidate = invalidateTransition();
    settlePendingPlaying(false);
    state.error = null;
    state.playIntentActive = true;

    let resolvePlaying;
    const playingPromise = new Promise((resolve) => {
      resolvePlaying = resolve;
    });
    pendingPlaying = { generation: candidate, resolve: resolvePlaying };

    try {
      const activeContext = ensureGraph();
      cancelAutomation(0);
      if (activeContext.state === 'suspended') await activeContext.resume();
      if (prepareCaptureOutput && !(await prepareCaptureOutput())) {
        if (candidate === transitionGeneration && !disposed) failCapture();
        return false;
      }
      if (candidate !== transitionGeneration || disposed) {
        return false;
      }
      captureInput?.setEnabled(true);
      await audio.play();
    } catch {
      if (candidate !== transitionGeneration || disposed) return false;
      state.playIntentActive = false;
      captureInput?.setEnabled(false);
      state.isPlaying = false;
      state.error = 'BGM 音訊無法播放。';
      state.playbackPhase = 'error';
      settlePendingPlaying(false);
      return false;
    }

    const didPlay = await playingPromise;
    return didPlay && candidate === transitionGeneration && !disposed;
  }

  async function fadeIn(durationSeconds) {
    if (!gainNode || !context || disposed) return false;
    const candidate = invalidateTransition();
    const duration = Math.max(0, Number(durationSeconds) || 0);
    const startTime = context.currentTime;
    const endTime = startTime + duration;
    cancelAutomation(gainNode.gain.value);
    gainNode.gain.linearRampToValueAtTime(effectiveGain(), endTime);
    state.playbackPhase = 'fading-in';
    await wait(duration * 1000);
    if (candidate !== transitionGeneration || disposed) return false;
    gainNode.gain.setValueAtTime(effectiveGain(), endTime);
    state.playbackPhase = state.isDimmed ? 'dimmed' : 'playing';
    return true;
  }

  async function fadeOutAndPause(durationSeconds) {
    const candidate = invalidateTransition();
    settlePendingPlaying(false);
    if (!context || !gainNode || audio.paused) {
      captureInput?.setEnabled(false);
      state.playIntentActive = false;
      if (gainNode && context) cancelAutomation(0);
      audio.pause();
      return true;
    }

    const duration = Math.max(0, Number(durationSeconds) || 0);
    const startTime = context.currentTime;
    const endTime = startTime + duration;
    cancelAutomation(gainNode.gain.value);
    gainNode.gain.linearRampToValueAtTime(0, endTime);
    state.playbackPhase = 'fading-out';
    await wait(duration * 1000);
    if (candidate !== transitionGeneration || disposed) return false;
    gainNode.gain.setValueAtTime(0, endTime);
    captureInput?.setEnabled(false);
    state.playIntentActive = false;
    audio.pause();
    return true;
  }

  function cut() {
    captureInput?.setEnabled(false);
    invalidateTransition();
    settlePendingPlaying(false);
    state.playIntentActive = false;
    if (gainNode && context) cancelAutomation(0);
    audio.pause();
    return true;
  }

  function applyLiveGain(durationMs) {
    if (!gainNode || !context || audio.paused) return;
    const duration = Math.max(0, durationMs) / 1000;
    cancelAutomation(gainNode.gain.value);
    if (settings.isMuted) {
      gainNode.gain.setValueAtTime(0, context.currentTime);
      return;
    }
    gainNode.gain.linearRampToValueAtTime(
      effectiveGain(),
      context.currentTime + duration,
    );
  }

  function setVolume(volume) {
    settings.volume = clamp(
      volume,
      audioControlValues.bgmVolume.min,
      audioControlValues.bgmVolume.max,
      settings.volume,
    );
    applyLiveGain(state.isDimmed ? settings.dimAttackMs : 0);
  }

  function setMuted(isMuted) {
    settings.isMuted = Boolean(isMuted);
    applyLiveGain(0);
  }

  function setDimmed(isDimmed) {
    state.isDimmed = Boolean(isDimmed);
    applyLiveGain(
      state.isDimmed ? settings.dimAttackMs : settings.dimReleaseMs,
    );
    if (state.isPlaying) {
      state.playbackPhase = state.isDimmed ? 'dimmed' : 'playing';
    }
  }

  function seek(positionSeconds) {
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const maximum =
      Number.isFinite(audio.duration) && audio.duration >= 0
        ? audio.duration
        : Number.MAX_SAFE_INTEGER;
    const position = clamp(positionSeconds, 0, maximum, current);
    audio.currentTime = position;
    state.currentTime = position;
    return position;
  }

  function hasSource() {
    return Boolean(sourceUrl);
  }

  function isSilentAndPaused() {
    return audio.paused && (!gainNode || gainNode.gain.value === 0);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    invalidateTransition();
    settlePendingPlaying(false);
    Object.entries(listeners).forEach(([type, listener]) => {
      audio.removeEventListener(type, listener);
    });
    cut();
    audio.removeAttribute('src');
    audio.load();
    sourceNode?.disconnect();
    gainNode?.disconnect?.();
    captureInput?.release();
    captureBridge?.stream.getTracks?.().forEach((track) => track.stop());
    if (context && context.state !== 'closed') await context.close();
  }

  return {
    state,
    configure,
    load,
    startSilent,
    fadeIn,
    fadeOutAndPause,
    cut,
    setVolume,
    setMuted,
    setDimmed,
    seek,
    hasSource,
    isSilentAndPaused,
    dispose,
  };
}

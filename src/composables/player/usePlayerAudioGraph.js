import SignalsmithStretch from 'signalsmith-stretch';

const GAIN_RAMP_SECONDS = 0.03;

export const TRANSPOSE_SEMITONES_RANGE = Object.freeze({ min: -12, max: 12 });
export const PITCH_CENTS_RANGE = Object.freeze({ min: -50, max: 50 });
export const TEMPO_RATE_RANGE = Object.freeze({ min: 0.5, max: 1.5 });
export const GUIDE_VOCAL_LEVEL_RANGE = Object.freeze({ min: 0, max: 1 });

export const PLAYER_AUDIO_DEFAULTS = Object.freeze({
  volume: 0.5,
  transposeSemitones: 0,
  pitchCents: 0,
  tempoRate: 1,
  monitorGuideVocalLevel: 0.5,
  captureGuideVocalLevel: 0,
});

function clamp(value, range) {
  return Math.min(range.max, Math.max(range.min, value));
}

// SoundTouchNode exposed two independent AudioParams (pitchSemitones,
// pitch-as-ratio) that combined additively. Signalsmith Stretch's
// .schedule() takes a single `semitones` field instead, so both user
// controls (coarse transpose + fine cents) collapse into one value here.
// Pure/DOM-independent — the one piece of this file that unit tests can
// actually exercise (see usePlayerAudioGraph.pitch.test.js and ADR 0019 for
// why the rest of this file's Web Audio behavior isn't automatable).
export function combinedSemitones(transposeSemitones, pitchCents) {
  return transposeSemitones + pitchCents / 100;
}

export function usePlayerAudioGraph({ audio, state, reportPlayerError }) {
  let audioCtx = null;
  let sourceNode = null;
  let splitter = null;
  let mergerInst = null;
  let mergerVoc = null;
  let vocalGain = null;
  let masterGain = null;
  let dryGain = null;
  let wetGain = null;
  let instBridgeDest = null;
  let vocBridgeDest = null;

  let captureGraph = null;
  let desiredCaptureDeviceId = null;
  let captureSelectionRevision = 0;
  let isDisposed = false;
  let pitchNode = null;
  let pitchNodeReady = null;
  let pitchProcessingError = null;
  let capturePitchProcessingError = null;
  let usesSeparatedAudioGraph = false;

  function connectSourceNode() {
    sourceNode.disconnect();
    if (usesSeparatedAudioGraph) {
      sourceNode.connect(splitter);
      return;
    }
    sourceNode.connect(masterGain);
    sourceNode.connect(instBridgeDest);
  }

  function ensureMonitorGraph() {
    if (audioCtx) return audioCtx;
    if (isDisposed) return null;

    audioCtx = new AudioContext();
    sourceNode = audioCtx.createMediaElementSource(audio);
    splitter = audioCtx.createChannelSplitter(4);
    mergerInst = audioCtx.createChannelMerger(2);
    mergerVoc = audioCtx.createChannelMerger(2);
    splitter.connect(mergerInst, 0, 0);
    splitter.connect(mergerInst, 1, 1);
    splitter.connect(mergerVoc, 2, 0);
    splitter.connect(mergerVoc, 3, 1);

    vocalGain = audioCtx.createGain();
    vocalGain.gain.value = state.guideVocalOn ? state.guideVocalValue : 0;
    mergerVoc.connect(vocalGain);

    masterGain = audioCtx.createGain();
    masterGain.gain.value = state.isMuted ? 0 : state.volume;
    mergerInst.connect(masterGain);
    vocalGain.connect(masterGain);

    dryGain = audioCtx.createGain();
    wetGain = audioCtx.createGain();
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;
    masterGain.connect(dryGain);
    dryGain.connect(audioCtx.destination);
    wetGain.connect(audioCtx.destination);

    // The monitor and capture chains need independent native destinations.
    // These bridges are created with the monitor graph, never during app
    // startup, so a persisted optional sink cannot open WebAudio early.
    instBridgeDest = audioCtx.createMediaStreamDestination();
    vocBridgeDest = audioCtx.createMediaStreamDestination();
    mergerInst.connect(instBridgeDest);
    mergerVoc.connect(vocBridgeDest);
    connectSourceNode();
    return audioCtx;
  }

  function rampGain(context, audioParam, target) {
    audioParam.setTargetAtTime(target, context.currentTime, GAIN_RAMP_SECONDS);
  }

  function hardStopGain(context, audioParam) {
    audioParam.cancelScheduledValues(context.currentTime);
    audioParam.setValueAtTime(0, context.currentTime);
  }

  function createCaptureGraph(deviceId) {
    if (!ensureMonitorGraph()) return null;
    const context = new AudioContext({ sinkId: deviceId });
    const graph = {
      deviceId,
      context,
      instSource: context.createMediaStreamSource(instBridgeDest.stream),
      vocSource: context.createMediaStreamSource(vocBridgeDest.stream),
      vocalGain: context.createGain(),
      mix: context.createGain(),
      dry: context.createGain(),
      wet: context.createGain(),
      pitchNode: null,
      pitchNodeReady: null,
      invalidated: false,
      disposed: false,
      closePromise: null,
      handleSinkChange: null,
      handleStateChange: null,
    };

    graph.vocalGain.gain.value = state.captureGuideVocalOn
      ? state.captureGuideVocalValue
      : 0;
    graph.vocSource.connect(graph.vocalGain);
    graph.instSource.connect(graph.mix);
    graph.vocalGain.connect(graph.mix);
    graph.dry.gain.value = 1;
    graph.wet.gain.value = 0;
    graph.mix.connect(graph.dry);
    graph.dry.connect(context.destination);
    graph.wet.connect(context.destination);

    graph.handleSinkChange = () => {
      const currentSinkId =
        typeof context.sinkId === 'string' ? context.sinkId : null;
      if (currentSinkId !== graph.deviceId) {
        invalidateCaptureGraph(graph, '選擇的輸出裝置已中斷連線。');
      }
    };
    graph.handleStateChange = () => {
      if (context.state !== undefined && context.state !== 'running') {
        invalidateCaptureGraph(graph, '擷取輸出已停止，請重新選擇裝置。');
      }
    };
    context.addEventListener('sinkchange', graph.handleSinkChange);
    context.addEventListener('statechange', graph.handleStateChange);
    captureGraph = graph;
    return graph;
  }

  function invalidateCaptureGraph(graph, message) {
    graph.invalidated = true;
    if (captureGraph !== graph) return;
    desiredCaptureDeviceId = null;
    state.captureError = message;
    state.captureDeviceId = null;
    void disposeCaptureGraph(graph);
  }

  function isCaptureGraphReady(graph) {
    if (graph.invalidated || graph.disposed || captureGraph !== graph) {
      return false;
    }
    if (
      graph.context.state !== undefined &&
      graph.context.state !== 'running'
    ) {
      return false;
    }
    return (
      typeof graph.context.sinkId !== 'string' ||
      graph.context.sinkId === graph.deviceId
    );
  }

  async function disposeCaptureGraph(graph = captureGraph) {
    if (!graph) return;
    if (graph.disposed) {
      await graph.closePromise;
      return;
    }
    graph.disposed = true;
    if (captureGraph === graph) captureGraph = null;

    graph.context.removeEventListener('sinkchange', graph.handleSinkChange);
    graph.context.removeEventListener('statechange', graph.handleStateChange);
    graph.instSource.disconnect();
    graph.vocSource.disconnect();
    graph.vocalGain.disconnect();
    graph.mix.disconnect();
    graph.dry.disconnect();
    graph.wet.disconnect();
    graph.pitchNode?.disconnect();

    graph.closePromise = (async () => {
      if (graph.context.state === 'closed') return;
      try {
        await graph.context.close();
      } catch {
        // The graph is already disconnected and no longer selected. A native
        // close failure must not retain a stale capture destination.
      }
    })();
    await graph.closePromise;
  }

  function applyCaptureGuideVocalGain() {
    const graph = captureGraph;
    if (!graph) return;
    rampGain(
      graph.context,
      graph.vocalGain.gain,
      state.captureGuideVocalOn ? state.captureGuideVocalValue : 0,
    );
  }

  function applyMonitorGuideVocalGain() {
    if (!audioCtx) return;
    rampGain(
      audioCtx,
      vocalGain.gain,
      state.guideVocalOn ? state.guideVocalValue : 0,
    );
  }

  function setGuideVocalValue(value) {
    state.guideVocalValue = clamp(value, GUIDE_VOCAL_LEVEL_RANGE);
    applyMonitorGuideVocalGain();
  }

  function setCaptureGuideVocalValue(value) {
    state.captureGuideVocalValue = clamp(value, GUIDE_VOCAL_LEVEL_RANGE);
    applyCaptureGuideVocalGain();
  }

  function setGuideVocalOn(on) {
    state.guideVocalOn = on;
    if (!audioCtx) return;
    if (on) applyMonitorGuideVocalGain();
    else hardStopGain(audioCtx, vocalGain.gain);
  }

  function setCaptureGuideVocalOn(on) {
    state.captureGuideVocalOn = on;
    if (on) applyCaptureGuideVocalGain();
    else if (captureGraph) {
      hardStopGain(captureGraph.context, captureGraph.vocalGain.gain);
    }
  }

  function restoreGuideVocalState(on, value) {
    state.guideVocalValue = value;
    state.guideVocalOn = on;
    applyMonitorGuideVocalGain();
  }

  function restoreCaptureGuideVocalState(on, value) {
    state.captureGuideVocalValue = value;
    state.captureGuideVocalOn = on;
    applyCaptureGuideVocalGain();
  }

  function reportPitchProcessingError(error) {
    pitchProcessingError = reportPlayerError(
      error,
      'pitch-processing',
      '音高調整暫時無法使用。',
    );
    state.error = pitchProcessingError;
  }

  function clearPitchProcessingError() {
    if (pitchProcessingError && state.error === pitchProcessingError) {
      state.error = null;
    }
    pitchProcessingError = null;
  }

  function reportCapturePitchProcessingError() {
    capturePitchProcessingError = '擷取輸出的音高調整暫時無法使用。';
    state.captureError = capturePitchProcessingError;
  }

  function clearCapturePitchProcessingError() {
    if (
      capturePitchProcessingError &&
      state.captureError === capturePitchProcessingError
    ) {
      state.captureError = null;
    }
    capturePitchProcessingError = null;
  }

  // Signalsmith Stretch caches its AudioWorklet module-registration promise
  // directly on the AudioContext object, and never clears it on failure —
  // unlike the SoundTouchNode registration this replaced, a rejection here
  // is permanent for this AudioContext's lifetime; re-attempting against the
  // same audioCtx will keep re-throwing the same error (confirmed by reading
  // the library source, not assumed). See ADR 0019 for why this is accepted
  // rather than worked around: the main graph's audioCtx is created once per
  // app session, so this mainly matters for capture (below), where recovery
  // means reselecting the output device to get a fresh AudioContext.
  async function ensurePitchNode() {
    if (!ensureMonitorGraph()) return null;
    if (pitchNode) return pitchNode;
    if (!pitchNodeReady) {
      pitchNodeReady = (async () => {
        const node = await SignalsmithStretch(audioCtx, {
          outputChannelCount: 2,
        });
        masterGain.connect(node);
        node.connect(wetGain);
        pitchNode = node;
        return node;
      })().catch((error) => {
        pitchNodeReady = null;
        throw error;
      });
    }
    return pitchNodeReady;
  }

  async function ensureCapturePitchNode(graph = captureGraph) {
    if (!graph || !isCaptureGraphReady(graph)) return null;
    if (graph.pitchNode) return graph.pitchNode;
    if (!graph.pitchNodeReady) {
      graph.pitchNodeReady = (async () => {
        const node = await SignalsmithStretch(graph.context, {
          outputChannelCount: 2,
        });
        if (!isCaptureGraphReady(graph)) return null;
        graph.mix.connect(node);
        node.connect(graph.wet);
        graph.pitchNode = node;
        return node;
      })().catch((error) => {
        graph.pitchNodeReady = null;
        throw error;
      });
    }
    return graph.pitchNodeReady;
  }

  function updatePitchBypass() {
    const active =
      state.transposeSemitones !== PLAYER_AUDIO_DEFAULTS.transposeSemitones ||
      state.pitchCents !== PLAYER_AUDIO_DEFAULTS.pitchCents;
    if (audioCtx) {
      rampGain(audioCtx, dryGain.gain, active ? 0 : 1);
      rampGain(audioCtx, wetGain.gain, active ? 1 : 0);
    }
    const graph = captureGraph;
    if (graph) {
      const captureActive = active && Boolean(graph.pitchNode);
      rampGain(graph.context, graph.dry.gain, captureActive ? 0 : 1);
      rampGain(graph.context, graph.wet.gain, captureActive ? 1 : 0);
    }
  }

  function syncPitchNodeToCurrentState(node) {
    node.schedule({
      active: true,
      semitones: combinedSemitones(state.transposeSemitones, state.pitchCents),
    });
  }

  async function syncCaptureChainToCurrentState(graph = captureGraph) {
    const needsPitch =
      state.transposeSemitones !== PLAYER_AUDIO_DEFAULTS.transposeSemitones ||
      state.pitchCents !== PLAYER_AUDIO_DEFAULTS.pitchCents;
    if (!needsPitch) return true;
    const node = await ensureCapturePitchNode(graph);
    if (!node || !isCaptureGraphReady(graph)) return false;
    syncPitchNodeToCurrentState(node);
    rampGain(graph.context, graph.dry.gain, 0);
    rampGain(graph.context, graph.wet.gain, 1);
    return true;
  }

  async function applyToCapturePitchNode() {
    const graph = captureGraph;
    if (graph?.pitchNode) {
      syncPitchNodeToCurrentState(graph.pitchNode);
      clearCapturePitchProcessingError();
      return;
    }
    if (!graph) return;

    const needsPitch =
      state.transposeSemitones !== PLAYER_AUDIO_DEFAULTS.transposeSemitones ||
      state.pitchCents !== PLAYER_AUDIO_DEFAULTS.pitchCents;
    if (!needsPitch) {
      clearCapturePitchProcessingError();
      return;
    }

    try {
      const node = await ensureCapturePitchNode(graph);
      if (!node || captureGraph !== graph) return;
      syncPitchNodeToCurrentState(node);
      clearCapturePitchProcessingError();
    } catch {
      if (captureGraph === graph) reportCapturePitchProcessingError();
    }
  }

  async function setTransposeSemitones(semitones) {
    const next = clamp(Math.round(semitones), TRANSPOSE_SEMITONES_RANGE);
    state.transposeSemitones = next;
    if (pitchNode) {
      syncPitchNodeToCurrentState(pitchNode);
    } else if (next !== PLAYER_AUDIO_DEFAULTS.transposeSemitones) {
      try {
        syncPitchNodeToCurrentState(await ensurePitchNode());
      } catch (error) {
        if (state.transposeSemitones === next) {
          state.transposeSemitones = PLAYER_AUDIO_DEFAULTS.transposeSemitones;
        }
        reportPitchProcessingError(error);
        return;
      }
    }
    clearPitchProcessingError();
    await applyToCapturePitchNode();
    updatePitchBypass();
  }

  async function setPitchCents(cents) {
    const next = clamp(Math.round(cents), PITCH_CENTS_RANGE);
    state.pitchCents = next;
    if (pitchNode) {
      syncPitchNodeToCurrentState(pitchNode);
    } else if (next !== PLAYER_AUDIO_DEFAULTS.pitchCents) {
      try {
        syncPitchNodeToCurrentState(await ensurePitchNode());
      } catch (error) {
        if (state.pitchCents === next) {
          state.pitchCents = PLAYER_AUDIO_DEFAULTS.pitchCents;
        }
        reportPitchProcessingError(error);
        return;
      }
    }
    clearPitchProcessingError();
    await applyToCapturePitchNode();
    updatePitchBypass();
  }

  function setTempoRate(rate) {
    const next = clamp(rate, TEMPO_RATE_RANGE);
    state.tempoRate = next;
    audio.defaultPlaybackRate = next;
    audio.playbackRate = next;
  }

  function resetPitchTempo() {
    setTempoRate(PLAYER_AUDIO_DEFAULTS.tempoRate);
    setTransposeSemitones(PLAYER_AUDIO_DEFAULTS.transposeSemitones);
    setPitchCents(PLAYER_AUDIO_DEFAULTS.pitchCents);
  }

  function resetTrackAudioControls() {
    setGuideVocalOn(true);
    setCaptureGuideVocalOn(false);
    resetPitchTempo();
  }

  function routeAudioGraph(usesSeparatedAudio) {
    if (usesSeparatedAudioGraph === usesSeparatedAudio) return;
    usesSeparatedAudioGraph = usesSeparatedAudio;
    if (audioCtx) connectSourceNode();
  }

  function setVolume(volume) {
    state.volume = volume;
    if (!audioCtx) return;
    rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : volume);
  }

  function setMuted(muted) {
    state.isMuted = Boolean(muted);
    if (!audioCtx) return;
    rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : state.volume);
  }

  function toggleMute() {
    setMuted(!state.isMuted);
  }

  function toggleCaptureGuideVocal() {
    setCaptureGuideVocalOn(!state.captureGuideVocalOn);
  }

  function prepareCaptureDevice(deviceId) {
    if (isDisposed) return false;
    desiredCaptureDeviceId = deviceId || null;
    state.captureDeviceId = desiredCaptureDeviceId;
    state.captureError = null;
    return true;
  }

  async function applyCaptureDevice(deviceId) {
    if (isDisposed) return;
    desiredCaptureDeviceId = deviceId || null;
    const selectionRevision = ++captureSelectionRevision;
    state.captureError = null;
    state.captureDeviceId = null;
    const previousGraph = captureGraph;
    await disposeCaptureGraph(previousGraph);
    if (isDisposed || selectionRevision !== captureSelectionRevision) return;
    if (!deviceId) {
      return;
    }
    let graph = null;
    try {
      graph = createCaptureGraph(deviceId);
      await graph.context.resume();
      if (
        isDisposed ||
        selectionRevision !== captureSelectionRevision ||
        !isCaptureGraphReady(graph)
      ) {
        await disposeCaptureGraph(graph);
        if (
          !isDisposed &&
          selectionRevision === captureSelectionRevision &&
          !state.captureError
        ) {
          desiredCaptureDeviceId = null;
          state.captureError = '擷取輸出裝置無法使用。';
        }
        return;
      }
      const synced = await syncCaptureChainToCurrentState(graph);
      if (
        !synced ||
        isDisposed ||
        selectionRevision !== captureSelectionRevision ||
        !isCaptureGraphReady(graph)
      ) {
        await disposeCaptureGraph(graph);
        return;
      }
      state.captureDeviceId = deviceId;
    } catch {
      await disposeCaptureGraph(graph);
      if (isDisposed || selectionRevision !== captureSelectionRevision) return;
      desiredCaptureDeviceId = null;
      state.captureDeviceId = null;
      state.captureError = '擷取輸出裝置無法使用。';
    }
  }

  async function resume() {
    const context = ensureMonitorGraph();
    if (!context) return;
    await context.resume();
    if (desiredCaptureDeviceId && !captureGraph) {
      const deviceId = desiredCaptureDeviceId;
      void applyCaptureDevice(deviceId).catch(() => {
        if (isDisposed || desiredCaptureDeviceId !== deviceId) return;
        desiredCaptureDeviceId = null;
        state.captureDeviceId = null;
        state.captureError = '擷取輸出裝置無法使用。';
      });
    }
  }

  function cleanup() {
    isDisposed = true;
    desiredCaptureDeviceId = null;
    captureSelectionRevision += 1;
    state.captureDeviceId = null;
    sourceNode?.disconnect();
    splitter?.disconnect();
    mergerInst?.disconnect();
    mergerVoc?.disconnect();
    vocalGain?.disconnect();
    masterGain?.disconnect();
    dryGain?.disconnect();
    wetGain?.disconnect();
    pitchNode?.disconnect();
    instBridgeDest?.disconnect();
    vocBridgeDest?.disconnect();
    void disposeCaptureGraph();
    void audioCtx?.close();
  }

  return {
    resume,
    routeAudioGraph,
    resetTrackAudioControls,
    restoreGuideVocalState,
    restoreCaptureGuideVocalState,
    setGuideVocalValue,
    setCaptureGuideVocalValue,
    setGuideVocalOn,
    setCaptureGuideVocalOn,
    setTransposeSemitones,
    setPitchCents,
    setTempoRate,
    resetPitchTempo,
    setVolume,
    setMuted,
    toggleMute,
    toggleCaptureGuideVocal,
    prepareCaptureDevice,
    applyCaptureDevice,
    cleanup,
  };
}

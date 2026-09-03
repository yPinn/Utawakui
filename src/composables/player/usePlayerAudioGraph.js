import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import pitchWorkletUrl from '@soundtouchjs/audio-worklet/processor?url';

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

export function usePlayerAudioGraph({ audio, state, reportPlayerError }) {
  const audioCtx = new AudioContext();
  const sourceNode = audioCtx.createMediaElementSource(audio);
  const splitter = audioCtx.createChannelSplitter(4);

  const mergerInst = audioCtx.createChannelMerger(2);
  const mergerVoc = audioCtx.createChannelMerger(2);
  splitter.connect(mergerInst, 0, 0);
  splitter.connect(mergerInst, 1, 1);
  splitter.connect(mergerVoc, 2, 0);
  splitter.connect(mergerVoc, 3, 1);

  const vocalGain = audioCtx.createGain();
  vocalGain.gain.value = PLAYER_AUDIO_DEFAULTS.monitorGuideVocalLevel;
  mergerVoc.connect(vocalGain);

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = PLAYER_AUDIO_DEFAULTS.volume;
  sourceNode.connect(masterGain);
  mergerInst.connect(masterGain);
  vocalGain.connect(masterGain);

  const dryGain = audioCtx.createGain();
  const wetGain = audioCtx.createGain();
  dryGain.gain.value = 1;
  wetGain.gain.value = 0;
  masterGain.connect(dryGain);
  dryGain.connect(audioCtx.destination);
  wetGain.connect(audioCtx.destination);

  // The monitor and OBS capture chains need independent native destinations.
  // Bridge the decoded accompaniment and guide-vocal streams before the
  // capture-only mix so each AudioContext can target its own output device.
  const instBridgeDest = audioCtx.createMediaStreamDestination();
  const vocBridgeDest = audioCtx.createMediaStreamDestination();
  mergerInst.connect(instBridgeDest);
  mergerVoc.connect(vocBridgeDest);
  sourceNode.connect(instBridgeDest);

  let captureGraph = null;
  let captureSelectionRevision = 0;
  let isDisposed = false;
  let pitchNode = null;
  let pitchNodeReady = null;
  let pitchProcessingError = null;
  let capturePitchProcessingError = null;
  let isUsingSeparatedAudioGraph = false;

  const workletRegistrations = new WeakMap();

  function rampGain(context, audioParam, target) {
    audioParam.setTargetAtTime(target, context.currentTime, GAIN_RAMP_SECONDS);
  }

  function hardStopGain(context, audioParam) {
    audioParam.cancelScheduledValues(context.currentTime);
    audioParam.setValueAtTime(0, context.currentTime);
  }

  function createCaptureGraph(deviceId) {
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

  function ensureWorkletRegistered(context) {
    let registration = workletRegistrations.get(context);
    if (!registration) {
      registration = SoundTouchNode.register(context, pitchWorkletUrl).catch(
        (error) => {
          workletRegistrations.delete(context);
          throw error;
        },
      );
      workletRegistrations.set(context, registration);
    }
    return registration;
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

  async function ensurePitchNode() {
    if (pitchNode) return pitchNode;
    if (!pitchNodeReady) {
      pitchNodeReady = (async () => {
        await ensureWorkletRegistered(audioCtx);
        const node = new SoundTouchNode({
          context: audioCtx,
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
        await ensureWorkletRegistered(graph.context);
        if (!isCaptureGraphReady(graph)) return null;
        const node = new SoundTouchNode({
          context: graph.context,
          outputChannelCount: 2,
        });
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
    rampGain(audioCtx, dryGain.gain, active ? 0 : 1);
    rampGain(audioCtx, wetGain.gain, active ? 1 : 0);
    const graph = captureGraph;
    if (graph) {
      const captureActive = active && Boolean(graph.pitchNode);
      rampGain(graph.context, graph.dry.gain, captureActive ? 0 : 1);
      rampGain(graph.context, graph.wet.gain, captureActive ? 1 : 0);
    }
  }

  function syncPitchNodeToCurrentState(node) {
    node.pitchSemitones.value = state.transposeSemitones;
    node.pitch.value = 2 ** (state.pitchCents / 1200);
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

  async function applyToCapturePitchNode(apply) {
    const graph = captureGraph;
    if (graph?.pitchNode) {
      apply(graph.pitchNode);
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
      pitchNode.pitchSemitones.value = next;
    } else if (next !== PLAYER_AUDIO_DEFAULTS.transposeSemitones) {
      try {
        (await ensurePitchNode()).pitchSemitones.value = next;
      } catch (error) {
        if (state.transposeSemitones === next) {
          state.transposeSemitones = PLAYER_AUDIO_DEFAULTS.transposeSemitones;
        }
        reportPitchProcessingError(error);
        return;
      }
    }
    clearPitchProcessingError();
    await applyToCapturePitchNode((node) => {
      node.pitchSemitones.value = next;
    });
    updatePitchBypass();
  }

  async function setPitchCents(cents) {
    const next = clamp(Math.round(cents), PITCH_CENTS_RANGE);
    state.pitchCents = next;
    const ratio = 2 ** (next / 1200);
    if (pitchNode) {
      pitchNode.pitch.value = ratio;
    } else if (next !== PLAYER_AUDIO_DEFAULTS.pitchCents) {
      try {
        (await ensurePitchNode()).pitch.value = ratio;
      } catch (error) {
        if (state.pitchCents === next) {
          state.pitchCents = PLAYER_AUDIO_DEFAULTS.pitchCents;
        }
        reportPitchProcessingError(error);
        return;
      }
    }
    clearPitchProcessingError();
    await applyToCapturePitchNode((node) => {
      node.pitch.value = ratio;
    });
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
    if (isUsingSeparatedAudioGraph === usesSeparatedAudio) return;
    sourceNode.disconnect();
    if (usesSeparatedAudio) {
      sourceNode.connect(splitter);
    } else {
      sourceNode.connect(masterGain);
      sourceNode.connect(instBridgeDest);
    }
    isUsingSeparatedAudioGraph = usesSeparatedAudio;
  }

  function setVolume(volume) {
    state.volume = volume;
    rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : volume);
  }

  function toggleMute() {
    state.isMuted = !state.isMuted;
    rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : state.volume);
  }

  function toggleCaptureGuideVocal() {
    setCaptureGuideVocalOn(!state.captureGuideVocalOn);
  }

  async function applyCaptureDevice(deviceId) {
    if (isDisposed) return;
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
      state.captureDeviceId = null;
      state.captureError = '擷取輸出裝置無法使用。';
    }
  }

  function cleanup() {
    isDisposed = true;
    captureSelectionRevision += 1;
    state.captureDeviceId = null;
    sourceNode.disconnect();
    splitter.disconnect();
    mergerInst.disconnect();
    mergerVoc.disconnect();
    vocalGain.disconnect();
    masterGain.disconnect();
    dryGain.disconnect();
    wetGain.disconnect();
    pitchNode?.disconnect();
    instBridgeDest.disconnect();
    vocBridgeDest.disconnect();
    void disposeCaptureGraph();
    audioCtx.close();
  }

  return {
    resume: () => audioCtx.resume(),
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
    toggleMute,
    toggleCaptureGuideVocal,
    applyCaptureDevice,
    cleanup,
  };
}

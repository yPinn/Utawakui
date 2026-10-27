import { loadPitchProcessor } from '../../utils/pitchProcessorLoader.js';
import { AUDIO_CONTROL_VALUES } from '../../utils/audioPreferences.js';
import { createAudioControlApplication } from '../../utils/audioControlApplication.js';
import {
  validPerformanceSettings,
  PERFORMANCE_SETTINGS_DEFAULTS,
} from '../../../shared/performanceSettings.mjs';

const GAIN_RAMP_SECONDS = 0.03;

export const TRANSPOSE_SEMITONES_RANGE = Object.freeze({ min: -12, max: 12 });
export const PITCH_CENTS_RANGE = Object.freeze({ min: -50, max: 50 });
export const TEMPO_RATE_RANGE = Object.freeze({ min: 0.5, max: 1.5 });
export const PLAYER_VOLUME_RANGE = Object.freeze({
  ...AUDIO_CONTROL_VALUES.performanceVolume,
});
export const GUIDE_VOCAL_LEVEL_RANGE = Object.freeze({
  min: AUDIO_CONTROL_VALUES.monitorGuideVocalLevel.min,
  max: AUDIO_CONTROL_VALUES.monitorGuideVocalLevel.max,
  step: AUDIO_CONTROL_VALUES.monitorGuideVocalLevel.step,
});

export const PLAYER_AUDIO_DEFAULTS = Object.freeze({
  volume: AUDIO_CONTROL_VALUES.performanceVolume.defaultValue,
  captureVolume: AUDIO_CONTROL_VALUES.captureVolume.defaultValue,
  ...PERFORMANCE_SETTINGS_DEFAULTS,
  monitorGuideVocalLevel:
    AUDIO_CONTROL_VALUES.monitorGuideVocalLevel.defaultValue,
  captureGuideVocalLevel:
    AUDIO_CONTROL_VALUES.captureGuideVocalLevel.defaultValue,
});

function clamp(value, range) {
  return Math.min(range.max, Math.max(range.min, value));
}

function boundedOrCurrent(value, range, currentValue) {
  return Number.isFinite(value) ? clamp(value, range) : currentValue;
}

// SoundTouchNode exposed two independent AudioParams (pitchSemitones,
// pitch-as-ratio) that combined additively. Signalsmith Stretch's
// .schedule() takes a single `semitones` field instead, so both user
// controls (coarse transpose + fine cents) collapse into one value here.
// This arithmetic is DOM-independent. Graph tests use Web Audio mocks for
// application ownership and routing; they do not measure real DSP quality.
export function combinedSemitones(transposeSemitones, pitchCents) {
  return transposeSemitones + pitchCents / 100;
}

export function usePlayerAudioGraph({
  audio,
  state,
  reportPlayerError,
  recordAudioDiagnostic = () => {},
}) {
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
  let monitorPitchFailed = false;
  let capturePitchProcessingError = null;
  let usesSeparatedAudioGraph = false;
  const captureInputs = new Map();
  let pendingCaptureSelection = null;
  let monitorControls = null;
  const applications = createAudioControlApplication({
    publish: (result) => {
      state.audioControlApplication = result;
    },
  });
  state.audioControlApplication = {
    status: 'idle',
    ok: false,
    requested: null,
    applied: null,
    lanes: { monitor: 'unconfirmed', capture: 'disabled' },
  };

  function controlValues() {
    return {
      transposeSemitones: state.transposeSemitones,
      pitchCents: state.pitchCents,
      tempoRate: state.tempoRate ?? PLAYER_AUDIO_DEFAULTS.tempoRate,
      monitorGuideVocalEnabled: state.guideVocalOn,
    };
  }

  function cancelAudioControlApplication() {
    applications.cancel();
  }

  function connectCaptureInput(graph, key, input) {
    const source = graph.context.createMediaStreamSource(input.stream);
    const gate = graph.context.createGain();
    gate.gain.value = input.enabled ? 1 : 0;
    source.connect(gate);
    // Programme inputs have already applied their own gain. They bypass the
    // performance mix, guide vocal and pitch processor.
    gate.connect(graph.output);
    graph.inputNodes.set(key, { source, gate });
  }

  function registerCaptureInput(stream, onUnavailable = () => {}) {
    const key = Symbol('capture-input');
    const input = { stream, onUnavailable, enabled: false };
    if (captureGraph && !captureGraph.disposed) {
      connectCaptureInput(captureGraph, key, input);
    }
    captureInputs.set(key, input);
    return {
      setEnabled(enabled) {
        if (!captureInputs.has(key)) return;
        input.enabled = enabled === true;
        const nodes = captureGraph?.inputNodes.get(key);
        if (!nodes) return;
        const context = captureGraph.context;
        nodes.gate.gain.cancelScheduledValues(context.currentTime);
        nodes.gate.gain.setValueAtTime(
          input.enabled ? 1 : 0,
          context.currentTime,
        );
      },
      release() {
        captureInputs.delete(key);
        const nodes = captureGraph?.inputNodes.get(key);
        nodes?.source.disconnect();
        nodes?.gate.disconnect();
        captureGraph?.inputNodes.delete(key);
      },
    };
  }
  function handleMonitorStateChange() {
    if (isDisposed || !state.isPlaying || audioCtx?.state === 'running') return;
    if (['suspended', 'interrupted', 'closed'].includes(audioCtx?.state)) {
      applications.invalidate('monitor');
      recordAudioDiagnostic('context-state', 'monitor', {
        status: audioCtx.state,
      });
    }
  }

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
    audioCtx.addEventListener?.('statechange', handleMonitorStateChange);
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
      output: context.createGain(),
      dry: context.createGain(),
      wet: context.createGain(),
      pitchNode: null,
      pitchFailed: false,
      prepared: false,
      inputNodes: new Map(),
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
    graph.output.gain.value =
      state.captureVolume ?? PLAYER_AUDIO_DEFAULTS.captureVolume;
    graph.dry.connect(graph.output);
    graph.wet.connect(graph.output);
    graph.output.connect(context.destination);

    graph.handleSinkChange = () => {
      const currentSinkId =
        typeof context.sinkId === 'string' ? context.sinkId : null;
      if (currentSinkId !== graph.deviceId) {
        invalidateCaptureGraph(graph, '選擇的輸出裝置已中斷連線。');
      }
    };
    graph.handleStateChange = () => {
      if (context.state !== undefined && context.state !== 'running') {
        if (
          !graph.disposed &&
          ['suspended', 'interrupted', 'closed'].includes(context.state)
        ) {
          recordAudioDiagnostic('context-state', 'capture', {
            status: context.state,
          });
        }
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
    applications.invalidate('capture', 'failed');
    desiredCaptureDeviceId = null;
    state.captureError = message;
    state.captureDeviceId = null;
    notifyCaptureUnavailable();
    void disposeCaptureGraph(graph);
  }

  function notifyCaptureUnavailable() {
    for (const input of captureInputs.values()) {
      try {
        input.onUnavailable();
      } catch {
        /* the sink still fails closed */
      }
    }
  }

  function isCaptureGraphReady(graph) {
    if (
      !graph ||
      graph.invalidated ||
      graph.disposed ||
      captureGraph !== graph
    ) {
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
    graph.output.disconnect();
    graph.dry.disconnect();
    graph.wet.disconnect();
    for (const { source, gate } of graph.inputNodes.values()) {
      source.disconnect();
      gate.disconnect();
    }
    graph.inputNodes.clear();
    if (graph.pitchNode) graph.pitchNode.onprocessorerror = null;
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
    state.guideVocalValue = boundedOrCurrent(
      value,
      GUIDE_VOCAL_LEVEL_RANGE,
      state.guideVocalValue,
    );
    applyMonitorGuideVocalGain();
  }

  function setCaptureGuideVocalValue(value) {
    state.captureGuideVocalValue = boundedOrCurrent(
      value,
      GUIDE_VOCAL_LEVEL_RANGE,
      state.captureGuideVocalValue,
    );
    applyCaptureGuideVocalGain();
  }

  function setGuideVocalOn(on) {
    state.guideVocalOn = Boolean(on);
    if (audioCtx) {
      if (state.guideVocalOn) applyMonitorGuideVocalGain();
      else hardStopGain(audioCtx, vocalGain.gain);
    }
    return applyAudioControls({
      ...controlValues(),
      monitorGuideVocalEnabled: Boolean(on),
    });
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

  function reportCapturePitchProcessingError(error) {
    capturePitchProcessingError = reportPlayerError(
      error,
      'capture-pitch-processing',
      '擷取輸出的音高調整暫時無法使用。',
    );
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

  // Signalsmith Stretch caches its AudioWorklet registration promise on the
  // AudioContext and never clears it on failure, so a rejection is permanent for
  // that AudioContext's lifetime (confirmed in the library source). ADR 0019
  // accepts this rather than working around it: the main graph's audioCtx is
  // created once per session, so it mainly affects capture (below), where recovery
  // means reselecting the output device to get a fresh AudioContext.
  async function ensurePitchNode() {
    if (!ensureMonitorGraph()) return null;
    if (pitchNode) return pitchNode;
    if (!pitchNodeReady) {
      pitchNodeReady = (async () => {
        const SignalsmithStretch = await loadPitchProcessor();
        if (isDisposed) return null;
        const node = await SignalsmithStretch(audioCtx, {
          outputChannelCount: [2],
        });
        if (isDisposed) {
          node.disconnect();
          return null;
        }
        node.onprocessorerror = () => {
          monitorPitchFailed = true;
          applications.invalidate('monitor', 'failed');
          recordAudioDiagnostic('processor-error', 'monitor');
        };
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
        const SignalsmithStretch = await loadPitchProcessor();
        if (!isCaptureGraphReady(graph)) return null;
        const node = await SignalsmithStretch(graph.context, {
          outputChannelCount: [2],
        });
        if (!isCaptureGraphReady(graph)) return null;
        graph.mix.connect(node);
        node.onprocessorerror = () => {
          graph.pitchFailed = true;
          if (captureGraph === graph)
            applications.invalidate('capture', 'failed');
          recordAudioDiagnostic('processor-error', 'capture');
        };
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

  function syncPitchNodeToCurrentState(node) {
    return node.schedule({
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
    await syncPitchNodeToCurrentState(node);
    if (!isCaptureGraphReady(graph)) return false;
    // Controls can reset while registration is pending. Choose the route from
    // current intent, just as the processor schedule above does.
    const active =
      state.transposeSemitones !== PLAYER_AUDIO_DEFAULTS.transposeSemitones ||
      state.pitchCents !== PLAYER_AUDIO_DEFAULTS.pitchCents;
    rampGain(graph.context, graph.dry.gain, active ? 0 : 1);
    rampGain(graph.context, graph.wet.gain, active ? 1 : 0);
    return true;
  }

  function validControls(values) {
    return validPerformanceSettings(values);
  }

  async function applyControlTarget(target, job) {
    const active =
      combinedSemitones(target.transposeSemitones, target.pitchCents) !== 0;
    try {
      if (active && monitorPitchFailed)
        throw new Error('Monitor pitch processor stopped');
      const node = active ? (pitchNode ?? (await ensurePitchNode())) : null;
      if (!job.isCurrent() || isDisposed) return false;
      if (active && !node) return false;
      if (node) {
        await node.schedule({
          active: true,
          semitones: combinedSemitones(
            target.transposeSemitones,
            target.pitchCents,
          ),
        });
        if (!job.isCurrent()) return false;
      }
      audio.defaultPlaybackRate = target.tempoRate;
      audio.playbackRate = target.tempoRate;
      if (
        audio.playbackRate !== target.tempoRate ||
        audio.defaultPlaybackRate !== target.tempoRate
      )
        throw new Error('Tempo not applied');
      if (!audioCtx) {
        job.lane('monitor', 'deferred');
        job.lane('capture', desiredCaptureDeviceId ? 'deferred' : 'disabled');
        return 'deferred';
      }
      rampGain(audioCtx, dryGain.gain, active ? 0 : 1);
      rampGain(audioCtx, wetGain.gain, active ? 1 : 0);
      if (target.monitorGuideVocalEnabled) applyMonitorGuideVocalGain();
      else hardStopGain(audioCtx, vocalGain.gain);
      monitorControls = { ...target };
      clearPitchProcessingError();
      job.lane('monitor', 'applied');
    } catch (error) {
      if (!job.isCurrent()) return false;
      // Preserve the historical live-control rollback when registration fails.
      // A failed result never promotes that fallback to a confirmed batch.
      state.transposeSemitones = monitorControls?.transposeSemitones ?? 0;
      state.pitchCents = monitorControls?.pitchCents ?? 0;
      reportPitchProcessingError(error);
      job.lane('monitor', 'failed');
      return false;
    }
    const graph = captureGraph;
    if (!graph) {
      job.lane(
        'capture',
        state.captureError
          ? 'failed'
          : desiredCaptureDeviceId
            ? 'unconfirmed'
            : 'disabled',
      );
      return !state.captureError && !desiredCaptureDeviceId;
    }
    try {
      if (!isCaptureGraphReady(graph)) throw new Error('Capture not ready');
      if (active && graph.pitchFailed)
        throw new Error('Capture pitch processor stopped');
      const node = active
        ? (graph.pitchNode ?? (await ensureCapturePitchNode(graph)))
        : null;
      if (!job.isCurrent() || captureGraph !== graph) return false;
      if (active && !node) throw new Error('Capture pitch unavailable');
      if (node)
        await node.schedule({
          active: true,
          semitones: combinedSemitones(
            target.transposeSemitones,
            target.pitchCents,
          ),
        });
      if (!job.isCurrent() || !isCaptureGraphReady(graph)) return false;
      rampGain(graph.context, graph.dry.gain, active ? 0 : 1);
      rampGain(graph.context, graph.wet.gain, active ? 1 : 0);
      clearCapturePitchProcessingError();
      job.lane('capture', 'applied');
      return true;
    } catch (error) {
      if (!job.isCurrent() || captureGraph !== graph) return false;
      reportCapturePitchProcessingError(error);
      job.lane('capture', 'failed');
      return false;
    }
  }

  function applyAudioControls(
    values,
    { beforeApply, isCurrent = () => true } = {},
  ) {
    if (!validControls(values) || isDisposed)
      return Promise.resolve({ ok: false, status: 'invalid', applied: null });
    const target = { ...values };
    beforeApply?.();
    state.transposeSemitones = target.transposeSemitones;
    state.pitchCents = target.pitchCents;
    state.tempoRate = target.tempoRate;
    state.guideVocalOn = target.monitorGuideVocalEnabled;
    return applications.run(target, (job) => applyControlTarget(target, job), {
      isCurrent,
    });
  }

  function setTransposeSemitones(semitones) {
    return applyAudioControls({
      ...controlValues(),
      transposeSemitones: clamp(
        Math.round(semitones),
        TRANSPOSE_SEMITONES_RANGE,
      ),
    });
  }

  function setPitchCents(cents) {
    return applyAudioControls({
      ...controlValues(),
      pitchCents: clamp(Math.round(cents), PITCH_CENTS_RANGE),
    });
  }

  function setTempoRate(rate) {
    return applyAudioControls({
      ...controlValues(),
      tempoRate: clamp(rate, TEMPO_RATE_RANGE),
    });
  }

  function resetPitchTempo() {
    return applyAudioControls({
      ...controlValues(),
      transposeSemitones: 0,
      pitchCents: 0,
      tempoRate: 1,
    });
  }

  function resetTrackAudioControls(values = PERFORMANCE_SETTINGS_DEFAULTS) {
    setCaptureGuideVocalOn(false);
    return applyAudioControls(values);
  }

  // Restore stages requested values while remaining paused/lazy. Only resume
  // prepares the necessary graph and publishes confirmed applied values.
  function stageAudioControls(values) {
    if (!validControls(values)) return;
    applications.invalidate('monitor');
    state.transposeSemitones = values.transposeSemitones;
    state.pitchCents = values.pitchCents;
    state.tempoRate = values.tempoRate;
    state.guideVocalOn = values.monitorGuideVocalEnabled;
    audio.defaultPlaybackRate = values.tempoRate;
    audio.playbackRate = values.tempoRate;
  }

  function routeAudioGraph(usesSeparatedAudio) {
    if (usesSeparatedAudioGraph === usesSeparatedAudio) return;
    usesSeparatedAudioGraph = usesSeparatedAudio;
    if (audioCtx) connectSourceNode();
  }

  function setCaptureVolume(volume) {
    state.captureVolume = boundedOrCurrent(
      volume,
      AUDIO_CONTROL_VALUES.captureVolume,
      state.captureVolume,
    );
    if (captureGraph)
      rampGain(
        captureGraph.context,
        captureGraph.output.gain,
        state.captureVolume,
      );
  }

  function setVolume(volume) {
    const nextVolume = boundedOrCurrent(
      volume,
      PLAYER_VOLUME_RANGE,
      state.volume,
    );
    state.volume = nextVolume;
    if (!audioCtx) return;
    rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : nextVolume);
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
    applications.invalidate('capture');
    desiredCaptureDeviceId = deviceId || null;
    state.captureDeviceId = desiredCaptureDeviceId;
    state.captureError = null;
    return true;
  }

  async function selectCaptureDevice(
    deviceId,
    { isCurrent = () => true, syncControls = true } = {},
  ) {
    if (isDisposed) return;
    desiredCaptureDeviceId = deviceId || null;
    const selectionRevision = ++captureSelectionRevision;
    state.captureError = null;
    state.captureDeviceId = null;
    const previousGraph = captureGraph;
    await disposeCaptureGraph(previousGraph);
    if (
      isDisposed ||
      !isCurrent() ||
      selectionRevision !== captureSelectionRevision
    )
      return;
    if (!deviceId) {
      return;
    }
    let graph = null;
    try {
      graph = createCaptureGraph(deviceId);
      for (const [key, input] of captureInputs)
        connectCaptureInput(graph, key, input);
      await graph.context.resume();
      if (
        isDisposed ||
        !isCurrent() ||
        selectionRevision !== captureSelectionRevision ||
        !isCaptureGraphReady(graph)
      ) {
        await disposeCaptureGraph(graph);
        if (
          !isDisposed &&
          isCurrent() &&
          selectionRevision === captureSelectionRevision &&
          !state.captureError
        ) {
          desiredCaptureDeviceId = null;
          state.captureError = '擷取輸出裝置無法使用。';
          notifyCaptureUnavailable();
        }
        return;
      }
      const synced =
        !syncControls || (await syncCaptureChainToCurrentState(graph));
      if (
        !synced ||
        isDisposed ||
        !isCurrent() ||
        selectionRevision !== captureSelectionRevision ||
        !isCaptureGraphReady(graph)
      ) {
        await disposeCaptureGraph(graph);
        return;
      }
      graph.prepared = true;
      state.captureDeviceId = deviceId;
    } catch {
      await disposeCaptureGraph(graph);
      if (
        isDisposed ||
        !isCurrent() ||
        selectionRevision !== captureSelectionRevision
      )
        return;
      desiredCaptureDeviceId = null;
      state.captureDeviceId = null;
      state.captureError = '擷取輸出裝置無法使用。';
      notifyCaptureUnavailable();
    }
  }

  function applyCaptureDevice(
    deviceId,
    { forApplication = false, isCurrent = () => true } = {},
  ) {
    if (!forApplication) applications.invalidate('capture');
    const operation = selectCaptureDevice(deviceId, {
      isCurrent,
      syncControls: !forApplication,
    });
    const pending = { deviceId, operation, isCurrent };
    pendingCaptureSelection = pending;
    const clear = () => {
      if (pendingCaptureSelection === pending) pendingCaptureSelection = null;
    };
    operation.then(clear, clear);
    return operation;
  }

  async function prepareCaptureOutput() {
    const deviceId = desiredCaptureDeviceId;
    if (!deviceId) return !state.captureError;
    if (pendingCaptureSelection?.deviceId === deviceId) {
      await pendingCaptureSelection.operation;
    } else if (!captureGraph || !isCaptureGraphReady(captureGraph)) {
      await applyCaptureDevice(deviceId);
    }
    return (
      desiredCaptureDeviceId === deviceId &&
      Boolean(captureGraph && isCaptureGraphReady(captureGraph)) &&
      !state.captureError
    );
  }

  function resume({ isCurrent = () => true, operation = 'resume' } = {}) {
    if (isDisposed)
      return Promise.resolve({ ok: false, status: 'cancelled', applied: null });
    const context = ensureMonitorGraph();
    const target = controlValues();
    return applications.run(
      target,
      async (job) => {
        if (!context || !job.isCurrent()) return false;
        try {
          await context.resume();
        } catch (error) {
          if (!job.isCurrent()) return false;
          state.error = reportPlayerError(
            error,
            operation,
            operation === 'resume'
              ? '目前無法繼續播放，請再試一次。'
              : '目前無法播放這首曲目，請再試一次。',
          );
          job.lane('monitor', 'failed');
          return false;
        }
        if (!job.isCurrent()) return false;
        if (context.state !== undefined && context.state !== 'running')
          return false;
        // Device preparation stays inside this application; user device changes
        // cancel it through applyCaptureDevice instead of joining its ownership.
        const deviceId = desiredCaptureDeviceId;
        if (
          deviceId &&
          (!captureGraph?.prepared || !isCaptureGraphReady(captureGraph))
        ) {
          if (
            pendingCaptureSelection?.deviceId === deviceId &&
            pendingCaptureSelection.isCurrent()
          )
            await pendingCaptureSelection.operation;
          else
            await applyCaptureDevice(deviceId, {
              forApplication: true,
              isCurrent: job.isCurrent,
            });
          if (!job.isCurrent()) return false;
        }
        if (
          state.captureError ||
          desiredCaptureDeviceId !== deviceId ||
          (deviceId && !isCaptureGraphReady(captureGraph))
        ) {
          job.lane('capture', 'failed');
          return false;
        }
        return applyControlTarget(target, job);
      },
      { isCurrent: () => !isDisposed && isCurrent() },
    );
  }

  function isPlaybackReady(result) {
    return (
      !isDisposed &&
      result?.ok === true &&
      state.audioControlApplication === result &&
      Boolean(
        audioCtx &&
        (audioCtx.state === undefined || audioCtx.state === 'running'),
      ) &&
      !state.captureError &&
      (!desiredCaptureDeviceId ||
        (captureGraph?.prepared && isCaptureGraphReady(captureGraph)))
    );
  }

  function cleanup() {
    applications.invalidate('monitor');
    isDisposed = true;
    audioCtx?.removeEventListener?.('statechange', handleMonitorStateChange);
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
    if (pitchNode) pitchNode.onprocessorerror = null;
    pitchNode?.disconnect();
    instBridgeDest?.disconnect();
    vocBridgeDest?.disconnect();
    void disposeCaptureGraph();
    captureInputs.clear();
    void audioCtx?.close();
  }

  return {
    resume,
    isPlaybackReady,
    applyAudioControls,
    cancelAudioControlApplication,
    routeAudioGraph,
    resetTrackAudioControls,
    stageAudioControls,
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
    setCaptureVolume,
    setVolume,
    setMuted,
    toggleMute,
    toggleCaptureGuideVocal,
    prepareCaptureDevice,
    applyCaptureDevice,
    prepareCaptureOutput,
    registerCaptureInput,
    cleanup,
  };
}

import { loadPitchProcessor } from '../../utils/pitchProcessorLoader.js';
import { AUDIO_CONTROL_VALUES } from '../../utils/audioPreferences.js';
import { createAudioControlApplication } from '../../utils/audioControlApplication.js';
import { t } from '../../utils/i18n.js';
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
  captureOnlyDirect = true,
  monitorBridgeReturn = true,
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
  let monitorOutput = null;
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
  let routeRevision = 0;
  let routeTail = Promise.resolve();
  let routePending = 0;
  let routeInFlight = false;
  let sinkTransition = null;
  let monitorReturn = null;
  let monitorRelay = null;
  let monitorFailureScope = null;
  const monitorReturnApplications = createAudioControlApplication({
    publish(result) {
      if (result.status === 'pending' || !monitorReturn) return;
      const transition = monitorReturn;
      monitorReturn = null;
      if (transition.kind === 'relay') {
        if (!transition.committed) disposeMonitorRelay(transition.graph);
        if (['failed', 'timeout'].includes(result.status))
          reportMonitorRelayFailure();
        return;
      }
      if (!transition.committed) {
        void disposeCaptureGraph(transition.graph);
        if (transition.committing) silenceOutputs();
      }
      if (['failed', 'timeout'].includes(result.status)) {
        reportCaptureDeviceFailure(false);
        if (transition.committing) notifyCaptureUnavailable();
      }
    },
  });
  const applications = createAudioControlApplication({
    publish: (result) => {
      state.audioControlApplication = result;
      // Only this parent's terminal result may cancel its relay. A different
      // control job must not revoke a newer device/BGM or monitor transaction.
      if (
        monitorReturn?.kind === 'relay' &&
        monitorReturn.ownerRevision === result.revision &&
        ['cancelled', 'timeout'].includes(result.status)
      ) {
        cancelMonitorReturn();
        if (result.status === 'timeout') reportMonitorRelayFailure();
      }
      if (routeInFlight && ['cancelled', 'timeout'].includes(result.status)) {
        silenceOutputs();
      }
    },
  });
  state.audioControlApplication = {
    status: 'idle',
    ok: false,
    requested: null,
    applied: null,
    lanes: { monitor: 'unconfirmed', capture: 'disabled' },
  };
  state.monitorOutputError = null;

  function controlValues() {
    return {
      transposeSemitones: state.transposeSemitones,
      pitchCents: state.pitchCents,
      tempoRate: state.tempoRate ?? PLAYER_AUDIO_DEFAULTS.tempoRate,
      monitorGuideVocalEnabled: state.guideVocalOn,
    };
  }

  function cancelAudioControlApplication() {
    cancelMonitorReturn();
    applications.cancel();
  }

  function cancelMonitorReturn() {
    monitorReturnApplications.cancel();
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
        if (
          enabled === true &&
          (captureGraph?.direct || sinkTransition || !sourceAtDefault())
        ) {
          input.enabled = false;
          try {
            input.onUnavailable();
          } catch {
            /* input stays closed */
          }
          return;
        }
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
    if (sinkTransition && audioCtx?.state === 'suspended') return;
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
    if (instBridgeDest) sourceNode.connect(instBridgeDest);
    if (captureGraph?.direct) sourceNode.connect(captureGraph.mix);
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
    monitorOutput = audioCtx.createGain();
    monitorOutput.gain.value = 1;
    dryGain.connect(monitorOutput);
    wetGain.connect(monitorOutput);
    monitorOutput.connect(audioCtx.destination);
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

  function monitorSilent() {
    return state.isMuted === true || state.volume === 0;
  }

  function directEligible() {
    return (
      captureOnlyDirect &&
      monitorSilent() &&
      typeof audioCtx?.setSinkId === 'function' &&
      ![...captureInputs.values()].some((input) => input.enabled)
    );
  }

  function silenceOutputs() {
    if (monitorRelay)
      hardStopGain(monitorRelay.context, monitorRelay.gate.gain);
    if (monitorOutput) hardStopGain(audioCtx, monitorOutput.gain);
    if (captureGraph)
      hardStopGain(captureGraph.context, captureGraph.gate.gain);
  }

  function sourceAtDefault() {
    return (
      !sinkTransition &&
      (typeof audioCtx?.sinkId !== 'string' || audioCtx.sinkId === '')
    );
  }

  function openMonitorOutput() {
    if (isMonitorRelayReady()) {
      monitorRelay.gate.gain.setValueAtTime(
        1,
        monitorRelay.context.currentTime,
      );
      return;
    }
    if (monitorOutput && sourceAtDefault() && !captureGraph?.direct)
      monitorOutput.gain.setValueAtTime(1, audioCtx.currentTime);
  }

  async function bindSourceSink(deviceId) {
    if (isDisposed || !audioCtx || audioCtx.state === 'closed') return false;
    if (audioCtx.sinkId !== deviceId) {
      if (typeof audioCtx.setSinkId !== 'function')
        return sourceAtDefault() && !deviceId;
      sinkTransition = { deviceId };
      try {
        await audioCtx.setSinkId(deviceId);
      } finally {
        sinkTransition = null;
      }
    }
    if (isDisposed) return false;
    await audioCtx.resume();
    return (
      (typeof audioCtx.sinkId !== 'string' || audioCtx.sinkId === deviceId) &&
      (audioCtx.state === undefined || audioCtx.state === 'running')
    );
  }

  // A cancelled logical job cannot cancel a native sink rebind. Keep the native
  // lane owned until it settles, with all terminals closed, before the next job.
  function routeOperation(work, inScope = () => true) {
    const revision = ++routeRevision;
    routePending += 1;
    const current = () =>
      !isDisposed && revision === routeRevision && inScope();
    const operation = routeTail
      .then(async () => {
        if (!current()) return;
        routeInFlight = true;
        try {
          return await work(current);
        } finally {
          if (!current() && !isDisposed) {
            silenceOutputs();
            if (captureGraph?.direct) await disposeCaptureGraph(captureGraph);
            try {
              await bindSourceSink('');
            } catch {
              /* unresolved output stays muted and unready */
            }
          }
          routeInFlight = false;
        }
      })
      .finally(() => {
        routePending -= 1;
      });
    routeTail = operation.catch(() => {});
    return operation;
  }

  function ensureCaptureBridges() {
    if (instBridgeDest) return;
    instBridgeDest = audioCtx.createMediaStreamDestination();
    vocBridgeDest = audioCtx.createMediaStreamDestination();
    mergerInst.connect(instBridgeDest);
    mergerVoc.connect(vocBridgeDest);
    connectSourceNode();
  }

  function createCaptureGraph(deviceId, direct = false, provisional = false) {
    if (!ensureMonitorGraph()) return null;
    const context = direct ? audioCtx : new AudioContext({ sinkId: deviceId });
    const graph = {
      direct,
      deviceId,
      context,
      instSource: null,
      vocSource: null,
      vocalGain: context.createGain(),
      mix: context.createGain(),
      output: context.createGain(),
      dry: context.createGain(),
      wet: context.createGain(),
      gate: context.createGain(),
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
    graph.vocalGain.connect(graph.mix);
    graph.dry.gain.value = 1;
    graph.wet.gain.value = 0;
    graph.mix.connect(graph.dry);
    graph.output.gain.value =
      state.captureVolume ?? PLAYER_AUDIO_DEFAULTS.captureVolume;
    graph.dry.connect(graph.output);
    graph.wet.connect(graph.output);
    graph.gate.gain.value = 0;
    graph.output.connect(graph.gate);
    graph.gate.connect(context.destination);

    if (!provisional) activateCaptureGraph(graph);
    return graph;
  }

  // Candidate construction never touches the live source, bridge FIFO or input
  // leases. Promotion is synchronous, inside the existing native routing lane.
  function activateCaptureGraph(graph) {
    const { context } = graph;
    if (graph.direct) {
      mergerVoc.connect(graph.vocalGain);
      if (usesSeparatedAudioGraph) mergerInst.connect(graph.mix);
      else sourceNode.connect(graph.mix);
    } else {
      ensureCaptureBridges();
      graph.instSource = context.createMediaStreamSource(instBridgeDest.stream);
      graph.vocSource = context.createMediaStreamSource(vocBridgeDest.stream);
      graph.vocSource.connect(graph.vocalGain);
      graph.instSource.connect(graph.mix);
    }
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
  }

  function invalidateCaptureGraph(graph, message) {
    if (graph.invalidated || graph.disposed) return;
    graph.invalidated = true;
    if (captureGraph !== graph) return;
    cancelMonitorReturn();
    disposeMonitorRelay();
    clearMonitorRelayError();
    applications.invalidate('capture', 'failed');
    desiredCaptureDeviceId = null;
    state.captureError = message;
    state.captureDeviceId = null;
    notifyCaptureUnavailable();
    void disposeCaptureGraph(graph);
    if (graph.direct) {
      silenceOutputs();
      void routeOperation(async (current) => {
        if (await bindSourceSink('')) {
          if (current()) openMonitorOutput();
        }
      }).catch(() => {});
    }
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
    return graph === captureGraph && captureResourcesReady(graph);
  }

  function captureResourcesReady(graph) {
    if (!graph || graph.invalidated || graph.disposed) {
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
    hardStopGain(graph.context, graph.gate.gain);
    if (captureGraph === graph) captureGraph = null;

    if (graph.handleSinkChange)
      graph.context.removeEventListener('sinkchange', graph.handleSinkChange);
    if (graph.handleStateChange)
      graph.context.removeEventListener('statechange', graph.handleStateChange);
    if (graph.direct) {
      mergerVoc.disconnect(graph.vocalGain);
      if (usesSeparatedAudioGraph) mergerInst.disconnect(graph.mix);
      else sourceNode.disconnect(graph.mix);
    }
    graph.instSource?.disconnect();
    graph.vocSource?.disconnect();
    graph.vocalGain.disconnect();
    graph.mix.disconnect();
    graph.output.disconnect();
    graph.dry.disconnect();
    graph.wet.disconnect();
    graph.gate.disconnect();
    for (const { source, gate } of graph.inputNodes.values()) {
      source.disconnect();
      gate.disconnect();
    }
    graph.inputNodes.clear();
    if (graph.pitchNode) graph.pitchNode.onprocessorerror = null;
    graph.pitchNode?.disconnect();

    graph.closePromise = (async () => {
      if (graph.direct) return;
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

  async function discardCaptureCandidate(graph) {
    const owned = captureGraph === graph;
    await disposeCaptureGraph(graph);
    if (
      owned &&
      graph?.direct &&
      !isDisposed &&
      !captureGraph &&
      !routePending
    ) {
      await routeOperation(async (current) => {
        if (current() && !captureGraph) await bindSourceSink('');
      });
    }
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
          if (monitorRelay) failMonitorRelay(monitorRelay);
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

  async function ensureCapturePitchNode(
    graph = captureGraph,
    ready = isCaptureGraphReady,
  ) {
    if (!graph || !ready(graph)) return null;
    if (graph.pitchNode) return graph.pitchNode;
    if (!graph.pitchNodeReady) {
      graph.pitchNodeReady = (async () => {
        const SignalsmithStretch = await loadPitchProcessor();
        if (!ready(graph)) return null;
        const node = await SignalsmithStretch(graph.context, {
          outputChannelCount: [2],
        });
        if (!ready(graph)) {
          node.disconnect();
          return null;
        }
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

  async function syncCaptureChainToCurrentState(
    graph = captureGraph,
    ready = isCaptureGraphReady,
  ) {
    const needsPitch =
      state.transposeSemitones !== PLAYER_AUDIO_DEFAULTS.transposeSemitones ||
      state.pitchCents !== PLAYER_AUDIO_DEFAULTS.pitchCents;
    if (!needsPitch) {
      if (!ready(graph)) return false;
      rampGain(graph.context, graph.dry.gain, 1);
      rampGain(graph.context, graph.wet.gain, 0);
      return true;
    }
    // A live graph owns its pending worklet resource even when an individual
    // relay/control job is cancelled. New jobs may share that factory; only the
    // current operation may schedule controls or update the live gains below.
    const resourceReady = graph === captureGraph ? isCaptureGraphReady : ready;
    const node = await ensureCapturePitchNode(graph, resourceReady);
    if (!node || !ready(graph)) return false;
    await syncPitchNodeToCurrentState(node);
    if (!ready(graph)) return false;
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
    if (monitorReturn) {
      const result = await monitorReturn.operation;
      if (!job.isCurrent() || !result.ok) return false;
    } else if (routePending && pendingCaptureSelection) {
      await pendingCaptureSelection.operation;
      if (!job.isCurrent()) return false;
    }
    if (captureGraph?.direct && !monitorSilent() && !isMonitorRelayReady()) {
      job.lane('monitor', 'unconfirmed');
      return false;
    }
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
      if (!routePending) openMonitorOutput();
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
      graph.gate.gain.setValueAtTime(1, graph.context.currentTime);
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
    if (monitorReturn) {
      const committing = monitorReturn.committing;
      cancelMonitorReturn();
      if (committing) void applyCaptureDevice(desiredCaptureDeviceId);
      else leaveDirectForMonitor();
    }
    return applications.run(target, (job) => applyControlTarget(target, job), {
      isCurrent,
    });
  }

  function setTransposeSemitones(semitones, options) {
    return applyAudioControls(
      {
        ...controlValues(),
        transposeSemitones: clamp(
          Math.round(semitones),
          TRANSPOSE_SEMITONES_RANGE,
        ),
      },
      options,
    );
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
    cancelMonitorReturn();
    disposeMonitorRelay();
    clearMonitorRelayError();
    setCaptureGuideVocalOn(false);
    return applyAudioControls(values);
  }

  // Restore stages requested values while remaining paused/lazy. Only resume
  // prepares the necessary graph and publishes confirmed applied values.
  function stageAudioControls(values) {
    if (!validControls(values)) return;
    cancelMonitorReturn();
    disposeMonitorRelay();
    clearMonitorRelayError();
    applications.invalidate('monitor');
    state.transposeSemitones = values.transposeSemitones;
    state.pitchCents = values.pitchCents;
    state.tempoRate = values.tempoRate;
    state.guideVocalOn = values.monitorGuideVocalEnabled;
    audio.defaultPlaybackRate = values.tempoRate;
    audio.playbackRate = values.tempoRate;
  }

  function routeAudioGraph(usesSeparatedAudio) {
    cancelMonitorReturn();
    disposeMonitorRelay();
    clearMonitorRelayError();
    if (usesSeparatedAudioGraph === usesSeparatedAudio) return;
    usesSeparatedAudioGraph = usesSeparatedAudio;
    if (audioCtx) {
      if (captureGraph?.direct) {
        // Remove only this capture edge; mergers also feed monitor/bridges.
        if (usesSeparatedAudio) sourceNode.disconnect(captureGraph.mix);
        else mergerInst.disconnect(captureGraph.mix);
        if (usesSeparatedAudio) mergerInst.connect(captureGraph.mix);
      }
      connectSourceNode();
    }
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
    leaveDirectForMonitor();
    rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : nextVolume);
  }

  function setMuted(muted) {
    state.isMuted = Boolean(muted);
    if (!audioCtx) return;
    leaveDirectForMonitor();
    rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : state.volume);
  }

  function toggleMute() {
    setMuted(!state.isMuted);
  }

  function leaveDirectForMonitor() {
    if (monitorSilent()) {
      const committing = monitorReturn?.committing;
      cancelMonitorReturn();
      disposeMonitorRelay();
      clearMonitorRelayError();
      // A native commit cannot be cancelled. Queue the latest silent intent
      // behind it; do not let the discarded candidate reopen either terminal.
      if (committing) void applyCaptureDevice(desiredCaptureDeviceId);
      return;
    }
    if (monitorReturn) return;
    if (isMonitorRelayReady()) return;
    if (canPrepareMonitorRelay()) {
      void prepareMonitorRelay();
      return;
    }
    if (!monitorSilent() && (captureGraph?.direct || !sourceAtDefault())) {
      if (
        captureGraph?.direct &&
        isCaptureGraphReady(captureGraph) &&
        !routePending &&
        captureGraph.deviceId === desiredCaptureDeviceId
      ) {
        prepareMonitorReturn();
      } else {
        void applyCaptureDevice(desiredCaptureDeviceId);
      }
    }
  }

  function canPrepareMonitorRelay() {
    return (
      monitorBridgeReturn &&
      captureGraph?.direct &&
      captureGraph.deviceId === desiredCaptureDeviceId &&
      isCaptureGraphReady(captureGraph) &&
      !routePending &&
      !sinkTransition &&
      ![...captureInputs.values()].some((input) => input.enabled)
    );
  }

  function relayResourcesReady(relay) {
    return Boolean(
      relay &&
      !relay.disposed &&
      !relay.invalidated &&
      (relay.context.state === undefined ||
        relay.context.state === 'running') &&
      (typeof relay.context.sinkId !== 'string' || relay.context.sinkId === ''),
    );
  }

  function isMonitorRelayReady() {
    return (
      relayResourcesReady(monitorRelay) &&
      monitorRelay.capture === captureGraph &&
      monitorRelay.source === audio.src &&
      monitorRelay.playbackRevision === state.playbackRevision &&
      canPrepareMonitorRelay() &&
      !monitorSilent()
    );
  }

  function disposeMonitorRelay(relay = monitorRelay) {
    if (!relay || relay.disposed) return;
    relay.disposed = true;
    if (monitorRelay === relay) monitorRelay = null;
    if (relay.gate) hardStopGain(relay.context, relay.gate.gain);
    if (relay.handleChange) {
      relay.context.removeEventListener('statechange', relay.handleChange);
      relay.context.removeEventListener('sinkchange', relay.handleChange);
    }
    if (relay.dryConnected) dryGain.disconnect(relay.bridge);
    if (relay.wetConnected) wetGain.disconnect(relay.bridge);
    relay.bridge?.disconnect();
    for (const track of relay.bridge?.stream.getTracks?.() ?? []) track.stop();
    relay.sourceNode?.disconnect();
    relay.gate?.disconnect();
    // Closing an independent monitor must never hold the source native lane.
    void relay.context.close().catch(() => {});
  }

  function reportMonitorRelayFailure() {
    const message = reportPlayerError(
      new Error('Default monitor output unavailable'),
      'monitor-output',
      t('playerAudio.monitorOutputUnavailable'),
    );
    const capture = captureGraph,
      source = audio.src;
    const selection = captureSelectionRevision,
      playback = state.playbackRevision;
    monitorFailureScope = () =>
      capture === captureGraph &&
      source === audio.src &&
      selection === captureSelectionRevision &&
      playback === state.playbackRevision;
    state.monitorOutputError = Object.freeze({
      code: 'PLAYER_MONITOR_OUTPUT_FAILED',
      message,
    });
  }

  function clearMonitorRelayError() {
    state.monitorOutputError = null;
    monitorFailureScope = null;
  }

  function retryMonitorOutput() {
    if (
      !state.monitorOutputError ||
      !monitorFailureScope?.() ||
      monitorSilent() ||
      !canPrepareMonitorRelay()
    )
      return Promise.resolve({ ok: false, status: 'cancelled' });
    clearMonitorRelayError();
    return monitorReturn?.kind === 'relay'
      ? monitorReturn.operation
      : prepareMonitorRelay();
  }

  function failMonitorRelay(relay) {
    if (!relay || relay.disposed) return;
    relay.invalidated = true;
    if (monitorReturn?.kind === 'relay' && monitorReturn.graph === relay) {
      monitorReturn.job.finish('failed');
    } else if (monitorRelay === relay) {
      disposeMonitorRelay(relay);
      applications.invalidate('monitor', 'failed');
      reportMonitorRelayFailure();
    }
  }

  function prepareMonitorRelay({
    forApplication = false,
    isCurrent = () => true,
  } = {}) {
    if (!forApplication) applications.invalidate('monitor');
    disposeMonitorRelay();
    const capture = captureGraph;
    const source = audio.src;
    const playbackRevision = state.playbackRevision;
    const selectionRevision = captureSelectionRevision;
    const target = controlValues();
    const transition = {
      kind: 'relay',
      graph: null,
      committed: false,
      job: null,
      operation: null,
      ownerRevision: forApplication
        ? state.audioControlApplication.revision
        : null,
    };
    monitorReturn = transition;
    const inScope = () =>
      !isDisposed &&
      monitorReturn === transition &&
      isCurrent() &&
      !monitorSilent() &&
      source === audio.src &&
      playbackRevision === state.playbackRevision &&
      selectionRevision === captureSelectionRevision &&
      capture === captureGraph &&
      Object.entries(target).every(
        ([key, value]) => controlValues()[key] === value,
      );
    transition.operation = monitorReturnApplications.run(
      target,
      async (job) => {
        transition.job = job;
        const active =
          combinedSemitones(target.transposeSemitones, target.pitchCents) !== 0;
        const ready = () =>
          job.isCurrent() &&
          canPrepareMonitorRelay() &&
          relayResourcesReady(transition.graph) &&
          (!active || (!monitorPitchFailed && !capture.pitchFailed));
        try {
          const relay = {
            context: new AudioContext({ sinkId: '' }),
            capture,
            source,
            playbackRevision,
            disposed: false,
          };
          transition.graph = relay;
          relay.gate = relay.context.createGain();
          relay.gate.gain.value = 0;
          relay.gate.connect(relay.context.destination);
          relay.bridge = audioCtx.createMediaStreamDestination();
          // Post-monitor-mix/DSP, pre-terminal: capture and its source edges are
          // untouched, and the existing source-context monitor stays closed.
          dryGain.connect(relay.bridge);
          relay.dryConnected = true;
          wetGain.connect(relay.bridge);
          relay.wetConnected = true;
          relay.sourceNode = relay.context.createMediaStreamSource(
            relay.bridge.stream,
          );
          relay.sourceNode.connect(relay.gate);
          await relay.context.resume();
          if (!ready()) return false;
          relay.handleChange = () => {
            if (!relayResourcesReady(relay)) failMonitorRelay(relay);
          };
          relay.context.addEventListener('statechange', relay.handleChange);
          relay.context.addEventListener('sinkchange', relay.handleChange);
          if (active) {
            const node = await ensurePitchNode();
            if (!ready() || !node) return false;
            await syncPitchNodeToCurrentState(node);
            if (!ready()) return false;
          }
          if (
            !(await syncCaptureChainToCurrentState(
              capture,
              (graph) =>
                graph === capture && ready() && isCaptureGraphReady(graph),
            )) ||
            !ready()
          )
            return false;
          rampGain(audioCtx, dryGain.gain, active ? 0 : 1);
          rampGain(audioCtx, wetGain.gain, active ? 1 : 0);
          applyMonitorGuideVocalGain();
          monitorRelay = relay;
          clearMonitorRelayError();
          openMonitorOutput();
          transition.committed = true;
          job.lane('monitor', 'applied');
          job.lane('capture', 'applied');
          return true;
        } catch {
          return false;
        }
      },
      { isCurrent: inScope },
    );
    return transition.operation;
  }

  function prepareMonitorReturn() {
    applications.invalidate('monitor');
    const previous = captureGraph;
    const deviceId = desiredCaptureDeviceId;
    const selectionRevision = captureSelectionRevision;
    const source = audio.src;
    const playbackRevision = state.playbackRevision;
    const target = controlValues();
    const transition = {
      graph: null,
      committing: false,
      committed: false,
      operation: null,
    };
    monitorReturn = transition;
    const inScope = () =>
      !isDisposed &&
      monitorReturn === transition &&
      !monitorSilent() &&
      deviceId === desiredCaptureDeviceId &&
      selectionRevision === captureSelectionRevision &&
      source === audio.src &&
      playbackRevision === state.playbackRevision &&
      Object.entries(target).every(
        ([key, value]) => controlValues()[key] === value,
      );
    transition.operation = monitorReturnApplications.run(
      target,
      async (job) => {
        let candidate;
        const active =
          combinedSemitones(target.transposeSemitones, target.pitchCents) !== 0;
        const ready = (graph) =>
          job.isCurrent() &&
          captureResourcesReady(graph) &&
          !graph.pitchFailed &&
          (!active || !monitorPitchFailed);
        try {
          candidate = createCaptureGraph(deviceId, false, true);
          transition.graph = candidate;
          await candidate.context.resume();
          if (!ready(candidate)) return false;
          // Both logical pitch lanes must acknowledge the same controls. This
          // prepares resources only; no live PCM readiness is inferred.
          if (active) {
            if (monitorPitchFailed)
              throw new Error('Monitor pitch processor stopped');
            const node = await ensurePitchNode();
            if (!ready(candidate) || !node) return false;
            await syncPitchNodeToCurrentState(node);
            if (!ready(candidate)) return false;
          }
          if (!(await syncCaptureChainToCurrentState(candidate, ready)))
            return false;
          if (!ready(candidate)) return false;
          await routeOperation(async (current) => {
            if (
              !current() ||
              !ready(candidate) ||
              captureGraph !== previous ||
              !isCaptureGraphReady(previous)
            )
              return;
            transition.committing = true;
            silenceOutputs();
            await disposeCaptureGraph(previous);
            if (!current()) return;
            if (!(await bindSourceSink('')))
              throw new Error('Source sink not restored');
            if (audioCtx.state !== undefined && audioCtx.state !== 'running')
              throw new Error('Source context not running');
            if (!current() || !ready(candidate) || !sourceAtDefault()) return;
            // Read mutable independent gains at commit, not the preparation
            // snapshot. No source or lease is connected before this point.
            candidate.vocalGain.gain.value = state.captureGuideVocalOn
              ? state.captureGuideVocalValue
              : 0;
            candidate.output.gain.value =
              state.captureVolume ?? PLAYER_AUDIO_DEFAULTS.captureVolume;
            rampGain(audioCtx, dryGain.gain, active ? 0 : 1);
            rampGain(audioCtx, wetGain.gain, active ? 1 : 0);
            applyMonitorGuideVocalGain();
            activateCaptureGraph(candidate);
            for (const [key, input] of captureInputs)
              connectCaptureInput(candidate, key, input);
            candidate.prepared = true;
            state.captureDeviceId = deviceId;
            state.captureError = null;
            candidate.gate.gain.setValueAtTime(
              1,
              candidate.context.currentTime,
            );
            openMonitorOutput();
            transition.committed = true;
          }, job.isCurrent);
          if (!job.isCurrent() || !transition.committed) return false;
          job.lane('monitor', 'applied');
          job.lane('capture', 'applied');
          return true;
        } catch {
          return false;
        }
      },
      { isCurrent: inScope },
    );
  }

  function reportCaptureDeviceFailure(clearSelection = true) {
    if (clearSelection) {
      desiredCaptureDeviceId = null;
      state.captureDeviceId = null;
    }
    state.captureError = '擷取輸出裝置無法使用。';
    if (clearSelection) notifyCaptureUnavailable();
  }

  function toggleCaptureGuideVocal() {
    setCaptureGuideVocalOn(!state.captureGuideVocalOn);
  }

  function prepareCaptureDevice(deviceId) {
    if (isDisposed) return false;
    cancelMonitorReturn();
    disposeMonitorRelay();
    clearMonitorRelayError();
    applications.invalidate('capture');
    desiredCaptureDeviceId = deviceId || null;
    state.captureDeviceId = desiredCaptureDeviceId;
    state.captureError = null;
    return true;
  }

  async function selectCaptureDevice(
    deviceId,
    {
      isCurrent = () => true,
      syncControls = true,
      direct = false,
      selectionRevision,
    } = {},
  ) {
    if (isDisposed) return;
    state.captureError = null;
    state.captureDeviceId = null;
    let graph = null;
    try {
      // Only source-sink ownership is serialized. An old capture context's
      // resume/worklet must not block a newer, independent capture selection.
      await routeOperation(async (current) => {
        await disposeCaptureGraph(captureGraph);
        if (!current()) return;
        direct = direct && directEligible();
        if (direct) {
          silenceOutputs();
          try {
            if (!(await bindSourceSink(deviceId)))
              throw new Error('Direct sink unavailable');
          } catch {
            if (!current()) return;
            if (!(await bindSourceSink('')))
              throw new Error('Source sink not restored');
            direct = false;
          }
          if (!current()) return;
          if (!directEligible()) {
            if (!(await bindSourceSink('')))
              throw new Error('Source sink not restored');
            direct = false;
          }
        } else if (!sourceAtDefault()) {
          if (!(await bindSourceSink('')))
            throw new Error('Source sink not restored');
        }
        if (!current()) return;
        if (!deviceId) {
          openMonitorOutput();
          return;
        }
        graph = createCaptureGraph(deviceId, direct);
        for (const [key, input] of captureInputs)
          connectCaptureInput(graph, key, input);
      }, isCurrent);
      if (!graph || !isCurrent()) {
        if (graph) await discardCaptureCandidate(graph);
        return;
      }
      await graph.context.resume();
      if (
        isDisposed ||
        !isCurrent() ||
        selectionRevision !== captureSelectionRevision ||
        !isCaptureGraphReady(graph)
      ) {
        await discardCaptureCandidate(graph);
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
        await discardCaptureCandidate(graph);
        return;
      }
      graph.prepared = true;
      state.captureDeviceId = deviceId;
      if (!direct) {
        clearMonitorRelayError();
        graph.gate.gain.setValueAtTime(1, graph.context.currentTime);
        openMonitorOutput();
      }
    } catch {
      await discardCaptureCandidate(graph);
      if (
        isDisposed ||
        !isCurrent() ||
        selectionRevision !== captureSelectionRevision
      )
        return;
      reportCaptureDeviceFailure();
    }
  }

  function applyCaptureDevice(
    deviceId,
    { forApplication = false, isCurrent = () => true, direct = false } = {},
  ) {
    cancelMonitorReturn();
    disposeMonitorRelay();
    clearMonitorRelayError();
    if (!forApplication) applications.invalidate('capture');
    desiredCaptureDeviceId = deviceId || null;
    const selectionRevision = ++captureSelectionRevision;
    const current = () =>
      !isDisposed &&
      selectionRevision === captureSelectionRevision &&
      isCurrent();
    if (captureGraph?.direct || sinkTransition) silenceOutputs();
    const operation = selectCaptureDevice(deviceId, {
      isCurrent: current,
      syncControls: !forApplication,
      direct,
      selectionRevision,
    });
    const pending = { deviceId, operation, isCurrent: current, direct };
    pendingCaptureSelection = pending;
    const clear = () => {
      if (pendingCaptureSelection === pending) pendingCaptureSelection = null;
    };
    operation.then(clear, clear);
    return operation;
  }

  async function prepareCaptureOutput() {
    const deviceId = desiredCaptureDeviceId;
    let selected = false;
    if (
      captureGraph?.direct ||
      sinkTransition ||
      pendingCaptureSelection?.direct
    ) {
      await applyCaptureDevice(deviceId);
      selected = true;
    } else if (pendingCaptureSelection?.deviceId === deviceId) {
      await pendingCaptureSelection.operation;
    }
    if (desiredCaptureDeviceId !== deviceId || state.captureError) return false;
    if (!deviceId) {
      await routeTail;
      return (
        !state.captureError &&
        !desiredCaptureDeviceId &&
        sourceAtDefault() &&
        !routePending
      );
    }
    // A singing preparation can have been queued before this await. BGM needs
    // the original independent sink even when that preparation finished direct.
    if (
      !selected &&
      (!captureGraph ||
        captureGraph.direct ||
        !isCaptureGraphReady(captureGraph))
    ) {
      await applyCaptureDevice(deviceId);
    }
    return (
      desiredCaptureDeviceId === deviceId &&
      Boolean(captureGraph && isCaptureGraphReady(captureGraph)) &&
      !state.captureError &&
      !routePending &&
      !captureGraph?.direct
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
        if (monitorReturn) {
          const result = await monitorReturn.operation;
          if (!job.isCurrent() || !result.ok) return false;
        }
        if (routePending) {
          await routeTail;
          if (!job.isCurrent()) return false;
        }
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
        if (
          !monitorSilent() &&
          canPrepareMonitorRelay() &&
          !isMonitorRelayReady()
        ) {
          const relayResult = await prepareMonitorRelay({
            forApplication: true,
            isCurrent: job.isCurrent,
          });
          if (!job.isCurrent() || !relayResult.ok) {
            job.lane('monitor', 'failed');
            return false;
          }
        }
        // Device preparation stays inside this application; user device changes
        // cancel it through applyCaptureDevice instead of joining its ownership.
        const deviceId = desiredCaptureDeviceId;
        const direct = Boolean(
          deviceId && (directEligible() || isMonitorRelayReady()),
        );
        if (
          deviceId &&
          (!captureGraph?.prepared ||
            !isCaptureGraphReady(captureGraph) ||
            captureGraph.direct !== direct ||
            routePending)
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
              direct,
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
      !routePending &&
      !sinkTransition &&
      (captureGraph?.direct
        ? directEligible() || isMonitorRelayReady()
        : sourceAtDefault()) &&
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
    cancelMonitorReturn();
    disposeMonitorRelay();
    clearMonitorRelayError();
    applications.invalidate('monitor');
    isDisposed = true;
    routeRevision += 1;
    audioCtx?.removeEventListener?.('statechange', handleMonitorStateChange);
    desiredCaptureDeviceId = null;
    captureSelectionRevision += 1;
    state.captureDeviceId = null;
    // Direct capture borrows source/merger edges. Remove those before the
    // shared nodes' disconnect-all; native targeted disconnect throws otherwise.
    void disposeCaptureGraph();
    sourceNode?.disconnect();
    splitter?.disconnect();
    mergerInst?.disconnect();
    mergerVoc?.disconnect();
    vocalGain?.disconnect();
    masterGain?.disconnect();
    dryGain?.disconnect();
    wetGain?.disconnect();
    monitorOutput?.disconnect();
    if (pitchNode) pitchNode.onprocessorerror = null;
    pitchNode?.disconnect();
    instBridgeDest?.disconnect();
    vocBridgeDest?.disconnect();
    captureInputs.clear();
    void audioCtx?.close();
  }

  return {
    resume,
    retryMonitorOutput,
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

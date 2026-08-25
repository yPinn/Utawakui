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

  let captureAudioCtx = null;
  let captureVocalGain = null;
  let captureMix = null;
  let captureDry = null;
  let captureWet = null;
  let pitchNode = null;
  let pitchNodeReady = null;
  let capturePitchNode = null;
  let capturePitchNodeReady = null;
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

  function handleCaptureSinkChange() {
    const currentSinkId =
      typeof captureAudioCtx.sinkId === 'string'
        ? captureAudioCtx.sinkId
        : null;
    if (state.captureDeviceId && currentSinkId !== state.captureDeviceId) {
      state.captureError = '選擇的輸出裝置已中斷連線。';
      state.captureDeviceId = null;
    }
  }

  function ensureCaptureGraph() {
    if (captureAudioCtx) return captureAudioCtx;
    captureAudioCtx = new AudioContext();
    captureAudioCtx.addEventListener('sinkchange', handleCaptureSinkChange);

    const instSource = captureAudioCtx.createMediaStreamSource(
      instBridgeDest.stream,
    );
    const vocSource = captureAudioCtx.createMediaStreamSource(
      vocBridgeDest.stream,
    );

    captureVocalGain = captureAudioCtx.createGain();
    captureVocalGain.gain.value = state.captureGuideVocalOn
      ? state.captureGuideVocalValue
      : 0;
    vocSource.connect(captureVocalGain);

    captureMix = captureAudioCtx.createGain();
    instSource.connect(captureMix);
    captureVocalGain.connect(captureMix);

    captureDry = captureAudioCtx.createGain();
    captureWet = captureAudioCtx.createGain();
    captureDry.gain.value = 1;
    captureWet.gain.value = 0;
    captureMix.connect(captureDry);
    captureDry.connect(captureAudioCtx.destination);
    captureWet.connect(captureAudioCtx.destination);

    return captureAudioCtx;
  }

  function applyMonitorGuideVocalGain() {
    rampGain(
      audioCtx,
      vocalGain.gain,
      state.guideVocalOn ? state.guideVocalValue : 0,
    );
  }

  function applyCaptureGuideVocalGain() {
    if (!captureVocalGain) return;
    rampGain(
      captureAudioCtx,
      captureVocalGain.gain,
      state.captureGuideVocalOn ? state.captureGuideVocalValue : 0,
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
    else if (captureVocalGain) {
      hardStopGain(captureAudioCtx, captureVocalGain.gain);
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

  async function ensureCapturePitchNode() {
    if (capturePitchNode) return capturePitchNode;
    if (!capturePitchNodeReady) {
      capturePitchNodeReady = (async () => {
        await ensureWorkletRegistered(captureAudioCtx);
        const node = new SoundTouchNode({
          context: captureAudioCtx,
          outputChannelCount: 2,
        });
        captureMix.connect(node);
        node.connect(captureWet);
        capturePitchNode = node;
        return node;
      })().catch((error) => {
        capturePitchNodeReady = null;
        throw error;
      });
    }
    return capturePitchNodeReady;
  }

  function updatePitchBypass() {
    const active =
      state.transposeSemitones !== PLAYER_AUDIO_DEFAULTS.transposeSemitones ||
      state.pitchCents !== PLAYER_AUDIO_DEFAULTS.pitchCents;
    rampGain(audioCtx, dryGain.gain, active ? 0 : 1);
    rampGain(audioCtx, wetGain.gain, active ? 1 : 0);
    if (captureAudioCtx) {
      const captureActive = active && Boolean(capturePitchNode);
      rampGain(captureAudioCtx, captureDry.gain, captureActive ? 0 : 1);
      rampGain(captureAudioCtx, captureWet.gain, captureActive ? 1 : 0);
    }
  }

  function syncPitchNodeToCurrentState(node) {
    node.pitchSemitones.value = state.transposeSemitones;
    node.pitch.value = 2 ** (state.pitchCents / 1200);
  }

  async function syncCaptureChainToCurrentState() {
    const needsPitch =
      state.transposeSemitones !== PLAYER_AUDIO_DEFAULTS.transposeSemitones ||
      state.pitchCents !== PLAYER_AUDIO_DEFAULTS.pitchCents;
    if (!needsPitch) return;
    const node = await ensureCapturePitchNode();
    syncPitchNodeToCurrentState(node);
    rampGain(captureAudioCtx, captureDry.gain, 0);
    rampGain(captureAudioCtx, captureWet.gain, 1);
  }

  async function applyToCapturePitchNode(apply) {
    if (capturePitchNode) {
      apply(capturePitchNode);
      clearCapturePitchProcessingError();
      return;
    }
    if (!captureAudioCtx) return;

    const needsPitch =
      state.transposeSemitones !== PLAYER_AUDIO_DEFAULTS.transposeSemitones ||
      state.pitchCents !== PLAYER_AUDIO_DEFAULTS.pitchCents;
    if (!needsPitch) {
      clearCapturePitchProcessingError();
      return;
    }

    try {
      const node = await ensureCapturePitchNode();
      syncPitchNodeToCurrentState(node);
      clearCapturePitchProcessingError();
    } catch {
      reportCapturePitchProcessingError();
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
    state.captureError = null;
    if (!deviceId) {
      await captureAudioCtx?.suspend();
      state.captureDeviceId = null;
      return;
    }
    try {
      const context = ensureCaptureGraph();
      await context.setSinkId(deviceId);
      await context.resume();
      await syncCaptureChainToCurrentState();
      state.captureDeviceId = deviceId;
    } catch {
      await captureAudioCtx?.suspend();
      state.captureDeviceId = null;
      state.captureError = '擷取輸出裝置無法使用。';
    }
  }

  function cleanup() {
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
    if (captureAudioCtx) {
      captureAudioCtx.removeEventListener(
        'sinkchange',
        handleCaptureSinkChange,
      );
      captureVocalGain.disconnect();
      captureMix.disconnect();
      captureDry.disconnect();
      captureWet.disconnect();
      capturePitchNode?.disconnect();
      captureAudioCtx.close();
    }
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

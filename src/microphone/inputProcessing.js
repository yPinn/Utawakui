import { measureMicrophoneLevel } from './level.js';
import { createMicrophonePitchEstimator } from './pitch.js';

export const PITCH_MIN_DBFS = -55;
export const MICROPHONE_ANALYSIS_SAMPLES = 2048;
export const MICROPHONE_LOW_CUT_OPTIONS_HZ = Object.freeze([0, 80, 120, 180]);

export const MICROPHONE_PROCESSING_KEYS = Object.freeze([
  'noiseSuppression',
  'echoCancellation',
  'autoGainControl',
]);
export function normalizeMicrophoneInputOptions(input = {}) {
  return {
    gainDb: Number.isFinite(input?.gainDb)
      ? Math.max(-24, Math.min(24, input.gainDb))
      : 0,
    highPassHz: MICROPHONE_LOW_CUT_OPTIONS_HZ.includes(input?.highPassHz)
      ? input.highPassHz
      : 0,
    ...Object.fromEntries(
      MICROPHONE_PROCESSING_KEYS.map((key) => [key, input?.[key] === true]),
    ),
  };
}
export function microphoneProcessingSupport(mediaDevices) {
  let supported = {};
  try {
    supported = mediaDevices?.getSupportedConstraints?.() ?? {};
  } catch {
    /* No confirmed support. */
  }
  return Object.fromEntries(
    MICROPHONE_PROCESSING_KEYS.map((key) => [key, supported[key] === true]),
  );
}

export function createMicrophoneInputGraph(
  context,
  stream,
  input = {},
  onCleanupError = () => {},
) {
  const options = normalizeMicrophoneInputOptions(input);
  const nodes = new Set();
  let disposed = false;
  const own = (node) => {
    nodes.add(node);
    return node;
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch (error) {
        onCleanupError(error);
      }
    }
  }
  try {
    const source = own(context.createMediaStreamSource(stream));
    const rawAnalyser = own(context.createAnalyser());
    const gain = own(context.createGain());
    const analyser = own(context.createAnalyser());
    rawAnalyser.fftSize = analyser.fftSize = MICROPHONE_ANALYSIS_SAMPLES;
    gain.gain.value = 10 ** (options.gainDb / 20);
    source.connect(rawAnalyser);
    source.connect(gain);
    let highPassHz = 0;
    let filter;
    function setHighPassHz(value) {
      if (disposed) return false;
      const next = normalizeMicrophoneInputOptions({
        highPassHz: value,
      }).highPassHz;
      if (next === highPassHz) return true;
      if (next && !filter) {
        filter = own(context.createBiquadFilter());
        filter.type = 'highpass';
        // Web Audio interprets highpass Q in dB.
        filter.Q.value = 20 * Math.log10(Math.SQRT1_2);
        filter.connect(gain);
      }
      if (next) filter.frequency.value = next;
      if (Boolean(next) !== Boolean(highPassHz)) {
        source.disconnect(highPassHz ? filter : gain);
        source.connect(next ? filter : gain);
      }
      highPassHz = next;
      return true;
    }
    setHighPassHz(options.highPassHz);
    gain.connect(analyser);
    const rawSamples = new Float32Array(rawAnalyser.fftSize);
    const samples = new Float32Array(analyser.fftSize);
    const estimatePitch = createMicrophonePitchEstimator(
      context.sampleRate,
      samples.length,
    );
    return {
      sample(includePitch = false) {
        if (disposed) throw new Error('Microphone graph is disposed');
        rawAnalyser.getFloatTimeDomainData(rawSamples);
        analyser.getFloatTimeDomainData(samples);
        const raw = measureMicrophoneLevel(rawSamples);
        const level = measureMicrophoneLevel(samples);
        return {
          ...level,
          rawDbfs: raw.dbfs,
          rawPeak: raw.peak,
          rawClipped: raw.clipped,
          ...(includePitch && {
            pitchHz:
              level.dbfs > PITCH_MIN_DBFS && !level.clipped && !raw.clipped
                ? estimatePitch(samples)
                : null,
          }),
        };
      },
      setGainDb(value) {
        if (disposed) return false;
        const bounded = normalizeMicrophoneInputOptions({
          gainDb: value,
        }).gainDb;
        gain.gain.setTargetAtTime(
          10 ** (bounded / 20),
          context.currentTime,
          0.01,
        );
        return true;
      },
      setHighPassHz,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

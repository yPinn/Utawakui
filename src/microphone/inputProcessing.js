import { measureMicrophoneLevel } from './level.js';

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
    highPassHz: [0, 80, 120, 180].includes(input?.highPassHz)
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
    rawAnalyser.fftSize = analyser.fftSize = 2048;
    gain.gain.value = 10 ** (options.gainDb / 20);
    source.connect(rawAnalyser);
    if (options.highPassHz) {
      const filter = own(context.createBiquadFilter());
      filter.type = 'highpass';
      filter.frequency.value = options.highPassHz;
      // Web Audio interprets highpass Q in dB; convert Butterworth's linear Q.
      filter.Q.value = 20 * Math.log10(Math.SQRT1_2);
      source.connect(filter);
      filter.connect(gain);
    } else source.connect(gain);
    gain.connect(analyser);
    const rawSamples = new Float32Array(rawAnalyser.fftSize);
    const samples = new Float32Array(analyser.fftSize);
    return {
      sample() {
        if (disposed) throw new Error('Microphone graph is disposed');
        rawAnalyser.getFloatTimeDomainData(rawSamples);
        analyser.getFloatTimeDomainData(samples);
        const raw = measureMicrophoneLevel(rawSamples);
        return {
          ...measureMicrophoneLevel(samples),
          rawDbfs: raw.dbfs,
          rawPeak: raw.peak,
          rawClipped: raw.clipped,
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
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

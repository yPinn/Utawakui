/* global window, performance, AudioContext, setInterval, clearInterval, setTimeout, fetch */
import { PeakAccumulator } from './peaks.mjs';
import { browserAdmission } from './policy.mjs';

window.runDecode = async function ({ url, metadata, cancel = false }) {
  const admission = browserAdmission(metadata);
  if (!admission.admitted) return { status: 'budget-refused', ...admission };
  const started = performance.now(),
    audio = new AudioContext({ sampleRate: metadata.sampleRate });
  let loopMaxMs = 0,
    last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    loopMaxMs = Math.max(loopMaxMs, now - last - 16);
    last = now;
  }, 16);
  try {
    const input = await (await fetch(url)).arrayBuffer();
    const decoding = audio.decodeAudioData(input),
      decodeStarted = performance.now();
    if (cancel) {
      const cancelAt = performance.now(),
        close = audio.close();
      const settled = await decoding.then(
        () => ({ status: 'fulfilled' }),
        () => ({ status: 'rejected' }),
      );
      await close;
      return {
        status: 'logical-cancel',
        decodeStatusAfterCancel: settled.status,
        settledAfterCancelMs: performance.now() - cancelAt,
        physicalStopProven: false,
        elapsedMs: performance.now() - started,
        ...admission,
      };
    }
    const buffer = await decoding,
      decodeMs = performance.now() - decodeStarted;
    const peaks = new PeakAccumulator({
      ...metadata,
      sampleRate: buffer.sampleRate,
    });
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    if (buffer.numberOfChannels !== metadata.channels)
      throw Error('CHANNEL_CHANGE');
    let blocks = 0;
    for (let from = 0; from < buffer.length; from += 8192) {
      peaks.pushPlanar(channels, from, Math.min(8192, buffer.length - from));
      if (++blocks % 8 === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const summary = peaks.finish();
    return {
      status: 'completed',
      elapsedMs: performance.now() - started,
      decodeMs,
      loopMaxMs,
      pcmBytes: buffer.length * buffer.numberOfChannels * 4,
      payloadBytes: summary.payloadBytes,
      workingSummaryBytes: summary.workingSummaryBytes,
      min: Math.min(...summary.coarse.min),
      max: Math.max(...summary.coarse.max),
      ...admission,
    };
  } catch (error) {
    return {
      status: 'failed',
      code: error.message,
      elapsedMs: performance.now() - started,
      ...admission,
    };
  } finally {
    clearInterval(timer);
    if (audio.state !== 'closed') await audio.close();
  }
};

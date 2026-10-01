const CLICK_DURATION_SECONDS = 0.05;
const CLICK_ATTACK_SECONDS = 0.001;
const CLICK_GAIN = 0.4;
const ACCENT_FREQUENCY_HZ = 1500;
const REGULAR_FREQUENCY_HZ = 900;

// Synthesized, not sampled: a shipped audio asset would need the source/SHA-256/
// license paperwork required for every bundled font (shared/assets/fonts/SOURCE-*.txt)
// and a legal-compliance.md §8.2/§11 entry. An OscillatorNode click needs none.
//
// Owns an independent AudioContext connected straight to `destination`, never to
// usePlayerAudioGraph.js's monitor/capture graph, so clicks cannot reach the
// capture (OBS sinkId) output or inherit player volume/mute/pitch. The context is
// created lazily on a user gesture (the metronome's start/toggle): not at module
// load (no AudioContext under Node/vitest), and to satisfy autoplay policy.
export function createMetronomeClickEngine({
  AudioContextImpl = typeof AudioContext === 'function' ? AudioContext : null,
} = {}) {
  let audioCtx = null;

  function ensureContext() {
    if (audioCtx) return audioCtx;
    if (typeof AudioContextImpl !== 'function') {
      throw new Error('目前環境不支援音訊播放，節拍器發聲已停用。');
    }
    audioCtx = new AudioContextImpl();
    return audioCtx;
  }

  function now() {
    return ensureContext().currentTime;
  }

  function resume() {
    return Promise.resolve(ensureContext().resume());
  }

  function scheduleClick(time, accent) {
    const ctx = ensureContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = accent
      ? ACCENT_FREQUENCY_HZ
      : REGULAR_FREQUENCY_HZ;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(CLICK_GAIN, time + CLICK_ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      time + CLICK_DURATION_SECONDS,
    );
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(time);
    oscillator.stop(time + CLICK_DURATION_SECONDS + 0.01);
  }

  function close() {
    if (!audioCtx) return Promise.resolve();
    const ctx = audioCtx;
    audioCtx = null;
    return ctx.close();
  }

  return { now, resume, scheduleClick, close };
}

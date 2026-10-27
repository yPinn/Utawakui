const CLICK_DURATION_SECONDS = 0.05;
const CLICK_ATTACK_SECONDS = 0.001;
const CLICK_GAIN = 0.4;
const ACCENT_FREQUENCY_HZ = 1500;
const REGULAR_FREQUENCY_HZ = 900;

// Synthesized, not sampled: a shipped audio asset would need the source/SHA-256/
// license paperwork required for every bundled font (shared/assets/fonts/SOURCE-*.txt)
// and a legal-compliance.md §8.2/§11 entry. An OscillatorNode click needs none.
//
// Owns an independent AudioContext with its own volume gain to `destination`, never to
// usePlayerAudioGraph.js's monitor/capture graph, so clicks cannot reach the
// capture (OBS sinkId) output or inherit player volume/mute/pitch. The context is
// created lazily on start/toggle and follows system default output: not at module
// load (no AudioContext under Node/vitest), and to satisfy autoplay policy.
export function createMetronomeClickEngine({
  AudioContextImpl = typeof AudioContext === 'function' ? AudioContext : null,
} = {}) {
  let audioCtx = null;
  let masterGain = null;
  let volume = 1;

  function detach() {
    const ctx = audioCtx;
    masterGain?.disconnect();
    audioCtx = null;
    masterGain = null;
    return ctx;
  }

  function ensureContext() {
    if (audioCtx) return audioCtx;
    if (typeof AudioContextImpl !== 'function') {
      throw new Error('目前環境不支援音訊播放，節拍器發聲已停用。');
    }
    const ctx = new AudioContextImpl();
    audioCtx = ctx;
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);

    return audioCtx;
  }

  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.min(1, Math.max(0, value));
    masterGain?.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.005);
  }

  function now() {
    return ensureContext().currentTime;
  }

  async function resume() {
    const ctx = ensureContext();
    let timer;
    try {
      await Promise.race([
        ctx.resume(),
        new Promise((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('節拍音效啟動逾時。')),
            5000,
          );
        }),
      ]);
      if (ctx !== audioCtx || (ctx.state && ctx.state !== 'running')) {
        throw new Error('節拍音效無法啟動，請確認系統預設輸出。');
      }
    } finally {
      clearTimeout(timer);
    }
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
    gain.connect(masterGain);
    oscillator.start(time);
    oscillator.stop(time + CLICK_DURATION_SECONDS + 0.01);
  }

  function close() {
    const ctx = detach();
    return ctx ? ctx.close() : Promise.resolve();
  }

  return {
    now,
    resume,
    scheduleClick,
    setVolume,
    close,
  };
}

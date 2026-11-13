'use strict';

const { randomInt } = require('node:crypto');

const durations = new Map([
  ['glitch', 330],
  ['zoom', 640],
  ['grain', 720],
]);
const kinds = [...durations.keys()];

function createOutputFisheyeEffects({ isAvailable, publish }) {
  let automatic = false;
  let timer = null;
  let activeUntil = 0;
  let lastAutomatic;

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!automatic || !isAvailable()) return;
    timer = setTimeout(
      () => {
        const choices = kinds.filter((kind) => kind !== lastAutomatic);
        lastAutomatic = choices[randomInt(choices.length)];
        trigger(lastAutomatic);
      },
      Math.max(0, activeUntil - Date.now()) + randomInt(2400, 5501),
    );
    timer.unref?.();
  }

  function trigger(effect) {
    const durationMs = durations.get(effect);
    if (!durationMs || !isAvailable()) return false;
    const startedAt = Date.now();
    if (
      !publish({
        type: 'overlay.fisheye.effect',
        effect,
        startedAt,
        durationMs,
      })
    ) {
      schedule();
      return false;
    }
    activeUntil = startedAt + durationMs;
    schedule();
    return true;
  }

  function control(action) {
    const ready = isAvailable();
    if (ready && (action === 'auto-on' || action === 'auto-off')) {
      automatic = action === 'auto-on';
      schedule();
    }
    const status = { state: ready ? 'ready' : 'unavailable', automatic };
    if (action === 'status' || action === 'auto-on' || action === 'auto-off')
      return status;
    if (!durations.has(action)) return { ...status, state: 'invalid-action' };
    if (!ready) return status;
    if (Date.now() < activeUntil) return { ...status, state: 'busy' };
    return trigger(action)
      ? { ...status, sent: true }
      : { ...status, state: 'no-output' };
  }

  function stop() {
    automatic = false;
    activeUntil = 0;
    lastAutomatic = undefined;
    clearTimeout(timer);
    timer = null;
  }

  return {
    control,
    onAvailabilityChanged() {
      if (!isAvailable()) stop();
    },
    stop,
  };
}

module.exports = { createOutputFisheyeEffects };

import { readonly, shallowRef } from 'vue';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function createMusicStructureSignals(options = {}) {
  const current = shallowRef(null);
  let requestGeneration = 0;

  function getBridge() {
    if (options.bridge) return options.bridge;
    return typeof window === 'undefined' ? undefined : window.Utawakui;
  }

  function assignCurrent(value) {
    current.value =
      value && typeof value === 'object'
        ? deepFreeze(structuredClone(value))
        : null;
  }

  function replaceCurrent(value) {
    requestGeneration += 1;
    assignCurrent(value);
  }

  function clear() {
    requestGeneration += 1;
    current.value = null;
  }

  async function loadForTrack(trackId) {
    const generation = ++requestGeneration;
    current.value = null;
    const bridge = getBridge();
    if (
      typeof trackId !== 'string' ||
      trackId.length === 0 ||
      typeof bridge?.getTrackMusicStructure !== 'function'
    ) {
      return null;
    }

    try {
      const result = await bridge.getTrackMusicStructure(trackId);
      if (
        generation !== requestGeneration ||
        !result ||
        result.trackId !== trackId
      ) {
        return null;
      }
      assignCurrent(result);
      return current.value;
    } catch {
      if (generation === requestGeneration) current.value = null;
      return null;
    }
  }

  return {
    current: readonly(current),
    replaceCurrent,
    clear,
    loadForTrack,
  };
}

const sharedSignals = createMusicStructureSignals();

export function useMusicStructureSignals() {
  return sharedSignals;
}

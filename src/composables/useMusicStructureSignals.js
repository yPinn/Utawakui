import { readonly, shallowRef } from 'vue';

const current = shallowRef(null);
let requestGeneration = 0;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
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
  if (
    typeof trackId !== 'string' ||
    trackId.length === 0 ||
    typeof window === 'undefined' ||
    typeof window.Utawakui?.getTrackMusicStructure !== 'function'
  ) {
    return null;
  }

  try {
    const result = await window.Utawakui.getTrackMusicStructure(trackId);
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

export function useMusicStructureSignals() {
  return {
    current: readonly(current),
    replaceCurrent,
    clear,
    loadForTrack,
  };
}

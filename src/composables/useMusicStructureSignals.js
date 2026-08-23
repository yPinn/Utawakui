import { readonly, shallowRef } from 'vue';

const current = shallowRef(null);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function replaceCurrent(value) {
  current.value =
    value && typeof value === 'object'
      ? deepFreeze(structuredClone(value))
      : null;
}

function clear() {
  current.value = null;
}

export function useMusicStructureSignals() {
  return {
    current: readonly(current),
    replaceCurrent,
    clear,
  };
}

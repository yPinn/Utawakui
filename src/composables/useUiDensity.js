import { onScopeDispose, readonly, shallowRef } from 'vue';

const UI_DENSITIES = new Set(['compact', 'standard']);

function normalizeUiDensity(value) {
  return UI_DENSITIES.has(value) ? value : 'compact';
}

function writeRootUiDensity(value) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.uiDensity = value;
}

const initialUiDensity = normalizeUiDensity(
  typeof window === 'undefined' ? undefined : window.Utawakui?.initialUiDensity,
);
const density = shallowRef(initialUiDensity);
writeRootUiDensity(initialUiDensity);

let stopBridge = null;

function applyUiDensity(value) {
  if (!UI_DENSITIES.has(value)) return;
  density.value = value;
  writeRootUiDensity(value);
}

export function useUiDensity() {
  const bridge = typeof window === 'undefined' ? null : window.Utawakui;
  if (!stopBridge && typeof bridge?.onUiDensityChanged === 'function') {
    const cleanup = bridge.onUiDensityChanged(applyUiDensity);
    stopBridge = typeof cleanup === 'function' ? cleanup : null;
  }

  onScopeDispose(() => {
    stopBridge?.();
    stopBridge = null;
  });

  return { density: readonly(density) };
}

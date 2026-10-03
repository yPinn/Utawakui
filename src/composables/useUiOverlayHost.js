import { inject, provide } from 'vue';
import { registeredOverlayHostSelector } from '../utils/rendererSurfaceRegistry.js';

export const UI_OVERLAY_HOST_KEY = Symbol('ui-overlay-host');

export function provideUiOverlayHost(surfaceId) {
  const selector = registeredOverlayHostSelector(surfaceId);
  provide(UI_OVERLAY_HOST_KEY, selector);
  return selector;
}

export function useUiOverlayHost() {
  return inject(UI_OVERLAY_HOST_KEY, null);
}

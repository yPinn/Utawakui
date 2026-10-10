<script setup>
import { provideUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import {
  UI_SURFACE_REGISTRY,
  registeredOverlayHostAttributes,
  registeredSurfaceAttributes,
} from '../../utils/rendererSurfaceRegistry.js';

const props = defineProps({
  surfaceId: { type: String, required: true },
  tag: { type: String, default: 'section' },
  // Child surfaces nested inside an isolated region (e.g. a scroll document)
  // mount their overlay hosts here so overlays still reach global layers.
  childHosts: { type: Array, default: () => [] },
  // The parent boundary mounts this surface's host via `childHosts`.
  detachedHost: { type: Boolean, default: false },
});

provideUiOverlayHost(props.surfaceId);
const surfaceAttributes = registeredSurfaceAttributes(props.surfaceId);
const overlayHostAttributes = registeredOverlayHostAttributes(props.surfaceId);
const childHostAttributes = props.childHosts.map((childId) => {
  if (UI_SURFACE_REGISTRY[childId]?.parentSurfaceId !== props.surfaceId) {
    throw new Error(
      `UI surface ${childId} is not a child of ${props.surfaceId}`,
    );
  }
  return registeredOverlayHostAttributes(childId);
});
</script>

<template>
  <component :is="tag" v-bind="surfaceAttributes" class="app-surface-boundary">
    <div
      v-if="!props.detachedHost"
      v-bind="overlayHostAttributes"
      class="ui-overlay-host"
    />
    <div
      v-for="attributes in childHostAttributes"
      :key="attributes.id"
      v-bind="attributes"
      class="ui-overlay-host"
    />
    <slot />
  </component>
</template>

<style scoped>
.app-surface-boundary {
  min-width: 0;
  min-height: 0;
  height: 100%;
}
</style>

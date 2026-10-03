<script setup>
import { provideUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import {
  registeredOverlayHostAttributes,
  registeredSurfaceAttributes,
} from '../../utils/rendererSurfaceRegistry.js';

const props = defineProps({
  surfaceId: { type: String, required: true },
  tag: { type: String, default: 'section' },
});

provideUiOverlayHost(props.surfaceId);
const surfaceAttributes = registeredSurfaceAttributes(props.surfaceId);
const overlayHostAttributes = registeredOverlayHostAttributes(props.surfaceId);
</script>

<template>
  <component :is="tag" v-bind="surfaceAttributes" class="app-surface-boundary">
    <div v-bind="overlayHostAttributes" class="ui-overlay-host" />
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

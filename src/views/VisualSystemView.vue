<script setup>
import DemoView from './DemoView.vue';
import { provideUiOverlayHost } from '../composables/useUiOverlayHost.js';
import {
  registeredOverlayHostAttributes,
  registeredSurfaceAttributes,
} from '../utils/rendererSurfaceRegistry.js';

provideUiOverlayHost('visual-review');
const visualReviewAttributes = registeredSurfaceAttributes('visual-review');
const visualReviewOverlayHostAttributes =
  registeredOverlayHostAttributes('visual-review');
</script>

<template>
  <div v-bind="visualReviewAttributes" class="visual-system-view">
    <div v-bind="visualReviewOverlayHostAttributes" class="ui-overlay-host" />
    <DemoView />
  </div>
</template>

<style scoped>
.visual-system-view {
  inline-size: 100%;
  block-size: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
</style>

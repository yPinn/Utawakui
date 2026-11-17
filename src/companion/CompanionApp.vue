<script setup>
import { computed } from 'vue';
import PerformerSurface from '../components/performer/PerformerSurface.vue';
import { usePerformerViewState } from '../composables/usePerformerViewState.js';
import { provideUiOverlayHost } from '../composables/useUiOverlayHost.js';
import { registeredOverlayHostAttributes } from '../utils/rendererSurfaceRegistry.js';
import '../styles/features/performer.css';
import { t } from '../utils/i18n.js';

const props = defineProps({
  status: { type: Object, required: true },
});

provideUiOverlayHost('performer');
const overlayHostAttributes = registeredOverlayHostAttributes('performer');
const {
  frame,
  readingScale,
  controlPending,
  setReadingScale,
  setDisplayBoundary,
} = usePerformerViewState();

const state = computed(() => props.status.value);
const message = computed(() =>
  state.value === 'live' ? '' : t(`companion.page.${state.value}`),
);
</script>

<template>
  <div class="companion-app">
    <div v-bind="overlayHostAttributes" class="ui-overlay-host" />
    <p
      v-if="message"
      class="companion-app__status"
      :class="{ 'companion-app__status--overlay': state === 'reconnecting' }"
      role="status"
    >
      {{ message }}
    </p>
    <PerformerSurface
      v-if="state === 'live' || state === 'reconnecting'"
      :frame="frame"
      mode="prompter"
      :reading-scale="readingScale"
      :pending="controlPending"
      @update:reading-scale="setReadingScale"
      @display-boundary="setDisplayBoundary"
    />
  </div>
</template>

<style scoped>
.companion-app {
  position: relative;
  display: grid;
  min-block-size: 100dvh;
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
    env(safe-area-inset-bottom) env(safe-area-inset-left);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
}

.companion-app__status {
  margin: auto;
  max-inline-size: 32ch;
  padding: var(--ui-space-4);
  text-align: center;
}

.companion-app__status--overlay {
  position: absolute;
  inset-block-start: var(--ui-space-2);
  inset-inline: var(--ui-space-2);
  margin: 0 auto;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  z-index: var(--ui-layer-raised);
}
</style>

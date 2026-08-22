<script setup>
import PerformerStage from '../components/performer/PerformerStage.vue';
import PerformerWindowToolbar from '../components/performer/PerformerWindowToolbar.vue';
import { usePerformerViewState } from '../composables/usePerformerViewState.js';

const {
  error,
  frame,
  windowState,
  close,
  minimize,
  toggleAlwaysOnTop,
  toggleFullScreen,
} = usePerformerViewState();
</script>

<template>
  <div class="performer-app">
    <PerformerWindowToolbar
      :full-screen="windowState.fullScreen"
      :always-on-top="windowState.alwaysOnTop"
      @close="close"
      @minimize="minimize"
      @toggle-always-on-top="toggleAlwaysOnTop"
      @toggle-full-screen="toggleFullScreen"
    />
    <PerformerStage :frame="frame" />
    <p v-if="error" class="performer-app__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.performer-app {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: var(--ui-titlebar-height) minmax(0, 1fr);
  overflow: hidden;
  background: var(--ui-color-canvas);
}

.performer-app__error {
  position: absolute;
  right: var(--ui-space-4);
  bottom: var(--ui-space-4);
  max-width: min(32rem, calc(100% - 2 * var(--ui-space-4)));
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-danger);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}
</style>

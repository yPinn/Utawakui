<script setup>
import PerformerSurface from '../components/performer/PerformerSurface.vue';
import PerformerWindowToolbar from '../components/performer/PerformerWindowToolbar.vue';
import UiNotice from '../components/ui/UiNotice.vue';
import { usePerformerViewState } from '../composables/usePerformerViewState.js';
import { provideUiOverlayHost } from '../composables/useUiOverlayHost.js';
import { registeredOverlayHostAttributes } from '../utils/rendererSurfaceRegistry.js';
import '../styles/features/performer.css';

provideUiOverlayHost('performer');
const performerOverlayHostAttributes =
  registeredOverlayHostAttributes('performer');

const {
  error,
  frame,
  readingScale,
  windowState,
  adjustLyricsOffset,
  close,
  minimize,
  setReadingScale,
  toggleAlwaysOnTop,
  toggleFullScreen,
} = usePerformerViewState();
</script>

<template>
  <div class="performer-app">
    <div v-bind="performerOverlayHostAttributes" class="ui-overlay-host" />
    <PerformerWindowToolbar
      :full-screen="windowState.fullScreen"
      :always-on-top="windowState.alwaysOnTop"
      @close="close"
      @minimize="minimize"
      @toggle-always-on-top="toggleAlwaysOnTop"
      @toggle-full-screen="toggleFullScreen"
    />
    <PerformerSurface
      :frame="frame"
      mode="prompter"
      :reading-scale="readingScale"
      @sync-action="adjustLyricsOffset"
      @update:reading-scale="setReadingScale"
    />
    <UiNotice
      v-if="error"
      class="performer-app__error"
      tone="danger"
      title="表演者畫面操作未完成"
      :message="error"
      compact
    />
  </div>
</template>

<style scoped>
.performer-app {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: var(--ui-window-titlebar-block-size) minmax(0, 1fr);
  overflow: hidden;
  background: var(--ui-color-canvas);
}

.performer-app__error {
  position: absolute;
  right: var(--ui-space-4);
  bottom: var(--ui-space-4);
  max-width: min(32rem, calc(100% - 2 * var(--ui-space-4)));
}
</style>

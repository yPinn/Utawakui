<script setup>
import { defineAsyncComponent, shallowRef } from 'vue';
import PerformerSurface from '../components/performer/PerformerSurface.vue';
import PerformerWindowToolbar from '../components/performer/PerformerWindowToolbar.vue';
import UiNotice from '../components/ui/UiNotice.vue';
import UiTabs from '../components/ui/UiTabs.vue';
import { usePerformerViewState } from '../composables/usePerformerViewState.js';
import { provideUiOverlayHost } from '../composables/useUiOverlayHost.js';
import { registeredOverlayHostAttributes } from '../utils/rendererSurfaceRegistry.js';
import '../styles/features/performer.css';
import { t } from '../utils/i18n.js';

provideUiOverlayHost('performer');
const performerOverlayHostAttributes =
  registeredOverlayHostAttributes('performer');

const {
  error,
  frame,
  snapshot,
  readingScale,
  control,
  controlPending,
  windowState,
  adjustLyricsOffset,
  close,
  minimize,
  setReadingScale,
  setDisplayBoundary,
  toggleAlwaysOnTop,
  toggleFullScreen,
} = usePerformerViewState();

const SingAlong = import.meta.env.DEV
  ? defineAsyncComponent(
      () => import('../components/internal-tools/PrompterSingAlong.vue'),
    )
  : null;
const layout = shallowRef('lyrics');
const layoutOptions = [
  { id: 'lyrics', label: t('performer.layoutDemo.lyrics') },
  { id: 'video-pitch', label: t('performer.layoutDemo.videoPitch') },
];

function selectLayout(value) {
  layout.value = value;
  setDisplayBoundary(null);
}
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
    >
      <template v-if="SingAlong" #layout>
        <UiTabs
          :items="layoutOptions"
          :active-id="layout"
          :aria-label="t('performer.layoutDemo.label')"
          variant="bar"
          tab-id-prefix="prompter-layout"
          panel-id-prefix="prompter-layout"
          @update:active-id="selectLayout"
        />
      </template>
    </PerformerWindowToolbar>
    <SingAlong
      v-if="SingAlong && layout === 'video-pitch'"
      id="prompter-layout-video-pitch-panel"
      role="tabpanel"
      aria-labelledby="prompter-layout-video-pitch-tab"
      :snapshot="snapshot"
      :reading-scale="readingScale"
      :pending="controlPending"
      @control="control"
      @sync-action="adjustLyricsOffset"
      @update:reading-scale="setReadingScale"
    />
    <PerformerSurface
      v-else
      :id="SingAlong ? 'prompter-layout-lyrics-panel' : undefined"
      :role="SingAlong ? 'tabpanel' : undefined"
      :aria-labelledby="SingAlong ? 'prompter-layout-lyrics-tab' : undefined"
      :frame="frame"
      mode="prompter"
      :reading-scale="readingScale"
      :pending="controlPending"
      @control="control"
      @sync-action="adjustLyricsOffset"
      @update:reading-scale="setReadingScale"
      @display-boundary="setDisplayBoundary"
    />
    <UiNotice
      v-if="error"
      class="performer-app__error"
      tone="danger"
      :title="t('performer.selfView.failedTitle')"
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
  /* UiNotice is an inline-size container, so it needs a definite width. */
  inline-size: min(32rem, calc(100% - 2 * var(--ui-space-4)));
}
</style>

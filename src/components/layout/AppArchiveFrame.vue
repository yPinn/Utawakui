<script setup>
import { provideUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import {
  registeredOverlayHostAttributes,
  registeredSurfaceAttributes,
} from '../../utils/rendererSurfaceRegistry.js';
import AppInnerPage from './AppInnerPage.vue';
import AppTopTabs from './AppTopTabs.vue';

provideUiOverlayHost('app-folder');
const appFolderAttributes = registeredSurfaceAttributes('app-folder');
const appFolderOverlayHostAttributes =
  registeredOverlayHostAttributes('app-folder');

defineProps({
  activeView: { type: String, required: true },
  tabActiveView: { type: String, default: '' },
  candidateView: { type: String, default: '' },
});

const emit = defineEmits(['update:activeView']);
</script>

<template>
  <section v-bind="appFolderAttributes" class="app-archive-frame">
    <div v-bind="appFolderOverlayHostAttributes" class="ui-overlay-host" />
    <div class="app-archive-frame__primary">
      <AppTopTabs
        class="app-archive-frame__tabs"
        :active-view="tabActiveView || activeView"
        :candidate-view="candidateView"
        @update:active-view="emit('update:activeView', $event)"
      />
      <AppInnerPage class="app-archive-frame__page">
        <slot />
      </AppInnerPage>
    </div>
  </section>
</template>

<style scoped>
.app-archive-frame {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  /* Clamped, not min-height — AppInnerPage's own scroll (see its CSS) only
     works if every ancestor up to .shell__main hands down a real, bounded
     height instead of "grow to fit content." */
  height: 100%;
  min-height: 0;
}

.app-archive-frame__primary {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.app-archive-frame__tabs {
  position: relative;
  /* Below the page panel (z-index: 1) — the panel's top edge should
     paint over the tabs in the overlap zone, so the tabs read as tucked
     underneath it rather than poking out in front of it. */
  z-index: 0;
  margin-bottom: calc(-1 * var(--ui-archive-rail-size));
}

.app-archive-frame__page {
  position: relative;
  z-index: 1;
  min-height: 0;
}
</style>

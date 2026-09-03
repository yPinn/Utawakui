<script setup>
import { useVisualSystemMode } from '../composables/useVisualSystemMode.js';
import UiTabs from '../components/ui/UiTabs.vue';
import DemoView from './DemoView.vue';
import StudioLibraryPrototypeView from './StudioLibraryPrototypeView.vue';

// Demo and Studio Library are both facets of the same not-yet-adopted
// tokens-v2 visual-refresh exploration (see DESIGN.md's "Visual refresh
// status" note) — one F-key switching between them internally instead of
// two separate global shortcuts.
const { mode, setMode } = useVisualSystemMode();

const TABS = [
  { id: 'demo', label: '元件展示' },
  { id: 'studio-library', label: 'Studio Library' },
];
</script>

<template>
  <div class="visual-system-view">
    <UiTabs
      class="visual-system-view__switch"
      :items="TABS"
      :active-id="mode"
      aria-label="視覺系統子頁面"
      tab-id-prefix="visual-system"
      @update:active-id="setMode"
    />
    <div class="visual-system-view__body">
      <DemoView v-if="mode === 'demo'" />
      <StudioLibraryPrototypeView v-else />
    </div>
  </div>
</template>

<style scoped>
.visual-system-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.visual-system-view__switch {
  flex: 0 0 auto;
  align-self: flex-start;
}

.visual-system-view__body {
  min-height: 0;
  flex: 1;
  display: flex;
}
</style>

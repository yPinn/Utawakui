<script setup>
import { useVisualSystemMode } from '../composables/useVisualSystemMode.js';
import UiTabs from '../components/ui/UiTabs.vue';
import DemoView from './DemoView.vue';
import SetlistView from './SetlistView.vue';
import StudioLibraryPrototypeView from './StudioLibraryPrototypeView.vue';

// Demo and Studio Library are both facets of the same not-yet-adopted
// tokens-v2 visual-refresh exploration (see DESIGN.md's "Visual refresh
// status" note) — one F-key switching between them internally instead of
// two separate global shortcuts.
const { mode, setMode } = useVisualSystemMode();

const PANELS = [
  { id: 'demo', label: '元件展示', component: DemoView },
  {
    id: 'studio-library',
    label: 'Studio Library Candidate',
    component: StudioLibraryPrototypeView,
  },
  { id: 'setlist-current', label: 'Setlist Current', component: SetlistView },
];
const TABS = PANELS.map(({ id, label }) => ({ id, label }));
</script>

<template>
  <div class="visual-system-view">
    <UiTabs
      class="visual-system-view__switch"
      :items="TABS"
      :active-id="mode"
      aria-label="視覺系統子頁面"
      tab-id-prefix="visual-system"
      panel-id-prefix="visual-system"
      @update:active-id="setMode"
    />
    <div
      v-for="panel in PANELS"
      :id="`visual-system-${panel.id}-panel`"
      :key="panel.id"
      class="visual-system-view__body"
      role="tabpanel"
      :aria-labelledby="`visual-system-${panel.id}-tab`"
      :hidden="mode !== panel.id"
    >
      <component :is="panel.component" v-if="mode === panel.id" />
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
  -webkit-user-select: none;
  user-select: none;
}

.visual-system-view__body {
  min-height: 0;
  min-width: 0;
  flex: 1;
  display: flex;
  width: 100%;
}

.visual-system-view__body[hidden] {
  display: none;
}

@media (max-height: 30rem) {
  .visual-system-view {
    min-height: 30rem;
  }
}
</style>

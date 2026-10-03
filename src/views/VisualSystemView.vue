<script setup>
import { useVisualReviewMode } from '../composables/useVisualReviewMode.js';
import UiTabs from '../components/ui/UiTabs.vue';
import DemoFinalDecisionBoard from '../components/demo/DemoFinalDecisionBoard.vue';
import DemoView from './DemoView.vue';
import StudioLibraryPrototypeView from './StudioLibraryPrototypeView.vue';
import { provideUiOverlayHost } from '../composables/useUiOverlayHost.js';
import {
  registeredOverlayHostAttributes,
  registeredSurfaceAttributes,
} from '../utils/rendererSurfaceRegistry.js';

provideUiOverlayHost('visual-review');
const visualReviewAttributes = registeredSurfaceAttributes('visual-review');
const visualReviewOverlayHostAttributes =
  registeredOverlayHostAttributes('visual-review');

// Demo and Studio Library are development-only review facets over the adopted
// token system. Candidate specimens remain visual evidence, not production
// implementations or extra destinations.
const { mode, setMode } = useVisualReviewMode();

const PANELS = [
  {
    id: 'final-board',
    label: '最終決策板',
    component: DemoFinalDecisionBoard,
  },
  {
    id: 'studio-library',
    label: 'Studio Library Candidate',
    component: StudioLibraryPrototypeView,
  },
  { id: 'demo', label: '元件回歸目錄', component: DemoView },
];
const TABS = PANELS.map(({ id, label }) => ({ id, label }));
</script>

<template>
  <div v-bind="visualReviewAttributes" class="visual-system-view">
    <div v-bind="visualReviewOverlayHostAttributes" class="ui-overlay-host" />
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

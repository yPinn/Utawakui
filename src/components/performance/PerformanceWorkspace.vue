<script setup>
import { onMounted } from 'vue';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformanceSessionWorkspace } from '../../composables/usePerformanceSessionWorkspace.js';
import PerformanceLyricsWorkspace from '../lyrics/PerformanceLyricsWorkspace.vue';
import AppSurfaceBoundary from '../layout/AppSurfaceBoundary.vue';
import PerformanceSessionWorkspace from '../performance-session/PerformanceSessionWorkspace.vue';
import UiTabs from '../ui/UiTabs.vue';

const PERFORMANCE_TOOLS = Object.freeze([
  Object.freeze({ id: 'live-lyrics', label: '歌詞' }),
  Object.freeze({ id: 'session', label: '待唱安排' }),
]);

const { performanceTool, selectPerformanceTool } = useAppView();
const sessionWorkspace = usePerformanceSessionWorkspace();
const { state: libraryState, initialize: initializeLibrary } = useLibrary();

onMounted(initializeLibrary);
</script>

<template>
  <section class="performance-workspace" aria-label="演唱工作區">
    <UiTabs
      :active-id="performanceTool"
      :items="PERFORMANCE_TOOLS"
      aria-label="演唱工具"
      tab-id-prefix="performance-tool"
      panel-id-prefix="performance-tool"
      variant="bar"
      @update:active-id="selectPerformanceTool"
    />

    <div
      v-if="performanceTool === 'session'"
      id="performance-tool-session-panel"
      class="performance-workspace__panel"
      role="tabpanel"
      aria-labelledby="performance-tool-session-tab"
    >
      <AppSurfaceBoundary
        surface-id="performance-session-workspace"
        class="performance-workspace__session-boundary"
        tag="div"
        detached-host
      >
        <PerformanceSessionWorkspace
          :tracks="libraryState.tracks"
          :show-return="sessionWorkspace.isOpen.value"
          @close="sessionWorkspace.close"
        />
      </AppSurfaceBoundary>
    </div>
    <div
      v-else
      id="performance-tool-live-lyrics-panel"
      class="performance-workspace__panel"
      role="tabpanel"
      aria-labelledby="performance-tool-live-lyrics-tab"
    >
      <PerformanceLyricsWorkspace />
    </div>
  </section>
</template>

<style scoped>
.performance-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.performance-workspace__panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.performance-workspace__session-boundary {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
</style>

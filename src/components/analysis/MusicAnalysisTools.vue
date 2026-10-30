<script setup>
import { shallowRef } from 'vue';
import UiTabs from '../ui/UiTabs.vue';
import MusicAnalysisBenchmarkReview from './MusicAnalysisBenchmarkReview.vue';
import MusicAnalysisReferenceAnnotation from './MusicAnalysisReferenceAnnotation.vue';
import MusicAnalysisWorkbench from './MusicAnalysisWorkbench.vue';

const TABS = Object.freeze([
  { id: 'jobs', label: '重跑／批次' },
  { id: 'annotation', label: '人工標註' },
  { id: 'benchmark', label: 'Benchmark' },
]);
const activeTab = shallowRef('jobs');
</script>

<template>
  <section class="analysis-tools" aria-label="音樂分析">
    <UiTabs
      v-model:active-id="activeTab"
      :items="TABS"
      aria-label="音樂分析模式"
      tab-id-prefix="analysis-tools"
      panel-id-prefix="analysis-tools"
    />

    <div
      :id="`analysis-tools-${activeTab}-panel`"
      class="analysis-tools__panel"
      role="tabpanel"
      :aria-labelledby="`analysis-tools-${activeTab}-tab`"
    >
      <MusicAnalysisWorkbench v-if="activeTab === 'jobs'" />
      <MusicAnalysisReferenceAnnotation
        v-else-if="activeTab === 'annotation'"
      />
      <MusicAnalysisBenchmarkReview v-else />
    </div>
  </section>
</template>

<style scoped>
.analysis-tools {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.analysis-tools__panel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>

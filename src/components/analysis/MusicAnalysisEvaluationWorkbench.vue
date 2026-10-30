<script setup>
import { shallowRef } from 'vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import MusicAnalysisBenchmarkReview from './MusicAnalysisBenchmarkReview.vue';
import MusicAnalysisReferenceAnnotation from './MusicAnalysisReferenceAnnotation.vue';

const MODES = Object.freeze([
  { id: 'annotation', label: '人工標註' },
  { id: 'benchmark', label: 'Benchmark Review' },
]);
const mode = shallowRef('annotation');
</script>

<template>
  <section
    class="analysis-evaluation"
    aria-labelledby="analysis-evaluation-title"
  >
    <UiPageHeader
      title="Music Analysis 評估"
      title-id="analysis-evaluation-title"
    />

    <UiSegmentedControl
      v-model="mode"
      :items="MODES"
      aria-label="Music Analysis 評估模式"
    />

    <div class="analysis-evaluation__body">
      <MusicAnalysisReferenceAnnotation v-if="mode === 'annotation'" />
      <MusicAnalysisBenchmarkReview v-else />
    </div>
  </section>
</template>

<style scoped>
.analysis-evaluation {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.analysis-evaluation__body {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>

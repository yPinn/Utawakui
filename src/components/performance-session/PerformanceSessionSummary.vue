<script setup>
import { computed } from 'vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import { performanceSessionSummary } from '../../utils/performanceSessionSummary.js';
import { formatDuration } from '../../utils/format.js';
import UiHint from '../ui/UiHint.vue';

const plan = usePerformanceSessionPlan();
const playback = usePerformanceSessionPlayback();
const { state: library } = useLibrary();
const summary = computed(() =>
  performanceSessionSummary(
    plan.state.plan.items,
    library.tracks,
    playback.currentItem.value?.itemId,
  ),
);
const durationLabel = computed(() =>
  summary.value.total > 0 &&
  summary.value.unknownDurationCount === summary.value.total
    ? '—'
    : formatDuration(summary.value.knownDuration),
);
</script>

<template>
  <section class="performance-session-summary" aria-label="播放安排統計">
    <UiHint class="performance-session-summary__source">{{
      plan.state.plan.source?.name ?? '播放安排'
    }}</UiHint>
    <UiHint v-if="plan.state.error || plan.state.validationError" tone="warning"
      >統計未更新</UiHint
    >
    <UiHint v-else-if="!plan.state.isInitialized">讀取安排統計…</UiHint>
    <template v-else>
      <p class="performance-session-summary__totals">
        <span>共 {{ summary.total }} 首</span>
        <span>已知總長 {{ durationLabel }}</span>
      </p>
      <p class="performance-session-summary__counts">
        <span>待播 {{ summary.pending }}</span>
        <span>目前播放 {{ summary.current }}</span>
        <span>已完成 {{ summary.completed }}</span>
      </p>
      <UiHint
        v-if="
          summary.unknownDurationCount || summary.skipped || summary.interrupted
        "
        class="performance-session-summary__notes"
      >
        <span v-if="summary.unknownDurationCount"
          >另 {{ summary.unknownDurationCount }} 首時長未知</span
        >
        <span v-if="summary.skipped">略過 {{ summary.skipped }}</span>
        <span v-if="summary.interrupted">中止 {{ summary.interrupted }}</span>
      </UiHint>
    </template>
  </section>
</template>

<style scoped>
.performance-session-summary {
  display: grid;
  gap: var(--ui-space-1);
  min-inline-size: 0;
  font-variant-numeric: tabular-nums;
}
.performance-session-summary__source {
  overflow-wrap: anywhere;
}
.performance-session-summary__totals,
.performance-session-summary__counts,
.performance-session-summary__notes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1) var(--ui-space-3);
  margin: 0;
}
.performance-session-summary__totals {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  line-height: var(--ui-type-label-line-height);
}
.performance-session-summary__counts {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
</style>

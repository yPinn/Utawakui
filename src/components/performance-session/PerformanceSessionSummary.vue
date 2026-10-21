<script setup>
import { computed, shallowRef } from 'vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import {
  performanceSessionSummary,
  formatPerformanceSessionSummary,
} from '../../utils/performanceSessionSummary.js';
import { formatDuration } from '../../utils/format.js';
import UiHint from '../ui/UiHint.vue';
import { Info } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiPopover from '../ui/UiPopover.vue';
const detailsOpen = shallowRef(false);

const props = defineProps({
  compact: { type: Boolean, default: false },
  scope: {
    type: String,
    default: 'plan',
    validator: (value) => ['plan', 'completed'].includes(value),
  },
  showSource: { type: Boolean, default: true },
});

const plan = usePerformanceSessionPlan();
const playback = usePerformanceSessionPlayback();
const { state: library } = useLibrary();
const summaryItems = computed(() =>
  props.scope === 'completed'
    ? plan.state.plan.items.filter((item) => item.progress === 'completed')
    : plan.state.plan.items,
);
const summary = computed(() =>
  performanceSessionSummary(
    summaryItems.value,
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
const compactSummaryLabel = computed(() =>
  formatPerformanceSessionSummary(summary.value, summaryItems.value),
);
</script>

<template>
  <section
    class="performance-session-summary"
    :aria-label="scope === 'completed' ? '演出紀錄統計' : '演出安排統計'"
  >
    <UiHint
      v-if="!compact && showSource && plan.state.plan.source?.name"
      class="performance-session-summary__source"
      >{{ plan.state.plan.source.name }}</UiHint
    >
    <UiHint v-if="plan.state.error" tone="warning">統計未更新</UiHint>
    <UiHint v-else-if="!plan.state.isInitialized">讀取安排統計…</UiHint>
    <template v-else>
      <UiHint v-if="compact" class="performance-session-summary__compact">{{
        compactSummaryLabel
      }}</UiHint>
      <p v-else class="performance-session-summary__totals">
        <span>共 {{ summary.total }} 項</span>
        <span>已知總長 {{ durationLabel }}</span>
      </p>
      <UiPopover
        v-if="
          !compact &&
          (summary.unknownDurationCount ||
            summary.skipped ||
            summary.interrupted)
        "
        aria-label="安排明細"
        focus-on-open
        placement="bottom-start"
        :open="detailsOpen"
        @update:open="detailsOpen = $event"
      >
        <template #trigger="{ triggerProps }">
          <UiIconButton
            v-bind="triggerProps"
            :icon="Info"
            label="安排明細"
            :active="detailsOpen"
            @click="detailsOpen = !detailsOpen"
          />
        </template>
        <UiHint class="performance-session-summary__detail-content">
          <span v-if="summary.unknownDurationCount"
            >另 {{ summary.unknownDurationCount }} 項時長未知</span
          >
          <span v-if="summary.skipped">略過 {{ summary.skipped }}</span>
          <span v-if="summary.interrupted">中止 {{ summary.interrupted }}</span>
        </UiHint></UiPopover
      >
    </template>
  </section>
</template>

<style scoped>
.performance-session-summary {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-1) var(--ui-space-3);
  min-inline-size: 0;
  max-inline-size: 100%;
  font-variant-numeric: tabular-nums;
}
.performance-session-summary__source {
  overflow-wrap: anywhere;
}
.performance-session-summary__totals,
.performance-session-summary__detail-content {
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
.performance-session-summary__compact {
  font-family: var(--ui-font-family-utility);
}
</style>

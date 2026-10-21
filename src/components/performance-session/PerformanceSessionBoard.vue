<script setup>
import { computed, shallowRef } from 'vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiTabs from '../ui/UiTabs.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import PerformanceSessionPlanList from './PerformanceSessionPlanList.vue';
import PerformanceSessionHistoryTools from './PerformanceSessionHistoryTools.vue';
const props = defineProps({
  tracks: { type: Array, default: () => [] },
  pendingCount: { type: Number, default: 0 },
  historyItems: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
});
defineEmits(['duplicate', 'remove']);
const activeTab = shallowRef('pending');
const tabs = computed(() => [
  { id: 'pending', label: '待唱', count: props.pendingCount },
  { id: 'history', label: '演出紀錄', count: props.historyItems.length },
]);
</script>
<template>
  <div class="performance-session-board">
    <UiTabs
      class="performance-session-board__tabs"
      :items="tabs"
      :active-id="activeTab"
      aria-label="演出安排內容"
      tab-id-prefix="session-board"
      panel-id-prefix="session-board"
      variant="bar"
      @update:active-id="activeTab = $event"
      ><template #after="{ item }"
        ><UiChip tone="muted">{{ item.count }}</UiChip></template
      ></UiTabs
    >
    <section
      v-show="activeTab === 'pending'"
      id="session-board-pending-panel"
      class="performance-session-board__column performance-session-board__pending"
      role="tabpanel"
      aria-labelledby="session-board-pending-tab"
    >
      <slot name="search" />
      <slot name="pending" />
    </section>
    <section
      v-show="activeTab === 'history'"
      id="session-board-history-panel"
      class="performance-session-board__column performance-session-board__history"
      role="tabpanel"
      aria-labelledby="session-board-history-tab"
    >
      <UiScrollLayout
        class="performance-session-board__history-scroll"
        aria-label="演出紀錄與封存場次"
      >
        <PerformanceSessionHistoryTools>
          <PerformanceSessionPlanList
            v-if="historyItems.length"
            :items="historyItems"
            :tracks="tracks"
            :saving="busy"
            history
            @duplicate="$emit('duplicate', $event)"
            @remove="$emit('remove', $event)"
          />
          <UiHint v-else>完成、略過與中止的項目會留在這裡。</UiHint>
        </PerformanceSessionHistoryTools>
      </UiScrollLayout>
    </section>
  </div>
</template>
<style scoped>
.performance-session-board {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-2);
  min-inline-size: 0;
  min-block-size: 0;
}
.performance-session-board__column {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  min-inline-size: 0;
  min-block-size: 0;
}
.performance-session-board__history-scroll {
  flex: 1;
  min-block-size: 0;
}
</style>

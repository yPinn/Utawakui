<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
} from 'vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiTabs from '../ui/UiTabs.vue';
import PerformanceSessionPlanList from './PerformanceSessionPlanList.vue';
const props = defineProps({
  tracks: { type: Array, default: () => [] },
  pendingCount: { type: Number, default: 0 },
  historyItems: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
});
defineEmits(['duplicate', 'remove']);
const activeTab = shallowRef('pending');
const narrow = shallowRef(false);
const board = useTemplateRef('board');
const history = useTemplateRef('history');
const tabs = computed(() => [
  { id: 'pending', label: '待唱', count: props.pendingCount },
  { id: 'history', label: '演出紀錄', count: props.historyItems.length },
]);
let observer;
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(([entry]) => {
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const next = entry.contentRect.width <= 43 * rem;
    if (
      next &&
      !narrow.value &&
      history.value?.contains(document.activeElement)
    )
      activeTab.value = 'history';
    narrow.value = next;
  });
  observer.observe(board.value);
});
onUnmounted(() => observer?.disconnect());
</script>
<template>
  <div
    ref="board"
    class="performance-session-board"
    :class="{ 'performance-session-board--narrow': narrow }"
  >
    <UiTabs
      v-if="narrow"
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
      v-show="!narrow || activeTab === 'pending'"
      id="session-board-pending-panel"
      class="performance-session-board__column performance-session-board__pending"
      :role="narrow ? 'tabpanel' : undefined"
      :aria-labelledby="
        narrow ? 'session-board-pending-tab' : 'session-pending-title'
      "
    >
      <header v-if="!narrow" class="performance-session-board__heading">
        <h2 v-if="!narrow" id="session-pending-title">
          待唱 <UiChip tone="muted">{{ pendingCount }}</UiChip>
        </h2>
      </header>
      <slot name="search" />
      <slot name="pending" />
    </section>
    <section
      v-show="!narrow || activeTab === 'history'"
      id="session-board-history-panel"
      ref="history"
      class="performance-session-board__column performance-session-board__history"
      :role="narrow ? 'tabpanel' : undefined"
      :aria-labelledby="
        narrow ? 'session-board-history-tab' : 'session-history-title'
      "
    >
      <header v-if="!narrow" class="performance-session-board__heading">
        <h2 id="session-history-title">
          演出紀錄 <UiChip tone="muted">{{ historyItems.length }}</UiChip>
        </h2>
      </header>
      <PerformanceSessionPlanList
        v-if="historyItems.length"
        :items="historyItems"
        :tracks="tracks"
        :saving="busy"
        history
        @duplicate="$emit('duplicate', $event)"
        @remove="$emit('remove', $event)"
      />
      <UiHint v-else padded center>完成、略過與中止的項目會留在這裡。</UiHint>
    </section>
  </div>
</template>
<style scoped>
.performance-session-board {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  grid-template-rows: minmax(0, 1fr);
  gap: var(--ui-space-4);
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
.performance-session-board__history {
  padding-inline-start: var(--ui-space-4);
  border-inline-start: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}
.performance-session-board__heading {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.performance-session-board__heading h2 {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.performance-session-board--narrow {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-2);
}
.performance-session-board--narrow .performance-session-board__history {
  border: 0;
  padding: 0;
}
.performance-session-board--narrow .performance-session-board__heading {
  justify-content: flex-end;
}
</style>

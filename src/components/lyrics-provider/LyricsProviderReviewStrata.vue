<script setup>
import { computed } from 'vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTabs from '../ui/UiTabs.vue';

const props = defineProps({
  strata: { type: Array, default: () => [] },
  selectedStratumId: { type: String, default: null },
  decisionFilter: { type: String, default: 'pending' },
  reachFilter: { type: String, default: 'all' },
  query: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:selectedStratumId',
  'update:decisionFilter',
  'update:reachFilter',
  'update:query',
]);

const decisionOptions = Object.freeze([
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待審' },
  { id: 'approved', label: '已核准' },
  { id: 'rejected', label: '已拒絕' },
]);
const reachOptions = Object.freeze([
  { id: 'all', label: '全部' },
  { id: 'mainstream', label: '主流' },
  { id: 'long-tail', label: '長尾' },
]);

const stratumTabs = computed(() =>
  props.strata.map((stratum) => ({
    ...stratum,
    disabled: props.disabled,
  })),
);
</script>

<template>
  <div class="review-strata">
    <UiTabs
      class="review-strata__tabs"
      :items="stratumTabs"
      :active-id="selectedStratumId"
      aria-label="歌詞語料分層"
      tab-id-prefix="lyrics-review-stratum"
      variant="bar"
      @update:active-id="emit('update:selectedStratumId', $event)"
    >
      <template #after="{ item }">
        <span class="review-strata__tab-count">
          {{ item.counts.approved }}/{{ item.counts.total }}
        </span>
      </template>
    </UiTabs>

    <div class="review-strata__filters">
      <div class="review-strata__filter-group">
        <span class="review-strata__filter-label">狀態</span>
        <UiSegmentedControl
          :items="decisionOptions"
          :model-value="decisionFilter"
          :disabled="disabled"
          aria-label="審核狀態"
          @update:model-value="emit('update:decisionFilter', $event)"
        />
      </div>

      <div class="review-strata__filter-group">
        <span class="review-strata__filter-label">曲庫</span>
        <UiSegmentedControl
          :items="reachOptions"
          :model-value="reachFilter"
          :disabled="disabled"
          aria-label="曲庫觸及"
          @update:model-value="emit('update:reachFilter', $event)"
        />
      </div>

      <UiSearchBox
        class="review-strata__search"
        label="搜尋歌詞語料候選"
        :model-value="query"
        :disabled="disabled"
        placeholder="搜尋歌名、歌手或 ID"
        @update:model-value="emit('update:query', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.review-strata {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
}

.review-strata__tabs {
  min-width: 0;
}

.review-strata__tab-count {
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-font-weight-regular);
  font-variant-numeric: tabular-nums;
}

.review-strata__filters {
  min-width: 0;
  display: grid;
  grid-template-columns: auto auto minmax(12rem, 1fr);
  align-items: end;
  gap: var(--ui-space-4);
}

.review-strata__filter-group {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.review-strata__filter-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.review-strata__search {
  width: 100%;
}

@media (max-width: 1120px) {
  .review-strata__filters {
    grid-template-columns: 1fr 1fr;
  }

  .review-strata__search {
    grid-column: 1 / -1;
  }
}
</style>

<script setup>
import { computed } from 'vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

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

const stratumOptions = computed(() =>
  props.strata.map((stratum) => ({
    ...stratum,
    disabled: props.disabled,
  })),
);
</script>

<template>
  <div class="review-strata">
    <UiSegmentedControl
      class="review-strata__strata"
      :items="stratumOptions"
      :model-value="selectedStratumId"
      :disabled="disabled"
      aria-label="歌詞語料分層"
      @update:model-value="emit('update:selectedStratumId', $event)"
    >
      <template #after="{ item }">
        <span class="review-strata__option-count">
          {{ item.counts.approved }}/{{ item.counts.total }}
        </span>
      </template>
    </UiSegmentedControl>

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

.review-strata__strata {
  min-width: 0;
}

.review-strata__option-count {
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
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.review-strata__search {
  width: 100%;
}

@container lyrics-review (max-width: 39rem) {
  .review-strata__filters {
    grid-template-columns: 1fr 1fr;
  }

  .review-strata__search {
    grid-column: 1 / -1;
  }
}
</style>

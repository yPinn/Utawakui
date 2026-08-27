<script setup>
import UiSearchBox from '../ui/UiSearchBox.vue';

defineProps({
  strata: { type: Array, default: () => [] },
  selectedStratumId: { type: String, default: null },
  decisionFilter: { type: String, default: 'pending' },
  reachFilter: { type: String, default: 'all' },
  query: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});

defineEmits([
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
</script>

<template>
  <div class="review-strata">
    <div class="review-strata__tabs" role="tablist" aria-label="歌詞語料分層">
      <button
        v-for="stratum in strata"
        :id="`lyrics-review-tab-${stratum.id}`"
        :key="stratum.id"
        class="review-strata__tab"
        :class="{
          'review-strata__tab--selected': selectedStratumId === stratum.id,
        }"
        type="button"
        role="tab"
        :aria-selected="selectedStratumId === stratum.id"
        :tabindex="selectedStratumId === stratum.id ? 0 : -1"
        :disabled="disabled"
        @click="$emit('update:selectedStratumId', stratum.id)"
      >
        <span>{{ stratum.label }}</span>
        <span class="review-strata__tab-count">
          {{ stratum.counts.approved }}/{{ stratum.counts.total }}
        </span>
      </button>
    </div>

    <div class="review-strata__filters">
      <fieldset class="review-strata__filter-group">
        <legend>狀態</legend>
        <button
          v-for="option in decisionOptions"
          :key="option.id"
          type="button"
          class="review-strata__filter"
          :class="{
            'review-strata__filter--selected': decisionFilter === option.id,
          }"
          :aria-pressed="decisionFilter === option.id"
          :disabled="disabled"
          @click="$emit('update:decisionFilter', option.id)"
        >
          {{ option.label }}
        </button>
      </fieldset>

      <fieldset class="review-strata__filter-group">
        <legend>曲庫</legend>
        <button
          v-for="option in reachOptions"
          :key="option.id"
          type="button"
          class="review-strata__filter"
          :class="{
            'review-strata__filter--selected': reachFilter === option.id,
          }"
          :aria-pressed="reachFilter === option.id"
          :disabled="disabled"
          @click="$emit('update:reachFilter', option.id)"
        >
          {{ option.label }}
        </button>
      </fieldset>

      <UiSearchBox
        class="review-strata__search"
        :model-value="query"
        placeholder="搜尋歌名、歌手或 ID"
        @update:model-value="$emit('update:query', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.review-strata {
  min-width: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
}

.review-strata__tabs {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(7rem, 1fr));
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  overflow-x: auto;
}

.review-strata__tab {
  position: relative;
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 0;
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  cursor: pointer;
  white-space: nowrap;
}

.review-strata__tab::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: transparent;
  content: '';
}

.review-strata__tab--selected {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.review-strata__tab--selected::after {
  background: var(--ui-color-accent);
}

.review-strata__tab:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.review-strata__tab:focus-visible,
.review-strata__filter:focus-visible {
  z-index: 1;
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.review-strata__tab-count {
  color: inherit;
  font-weight: var(--ui-font-weight-regular);
}

.review-strata__filters {
  min-width: 0;
  display: grid;
  grid-template-columns: auto auto minmax(12rem, 1fr);
  align-items: center;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) var(--ui-space-3);
}

.review-strata__filter-group {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  margin: 0;
}

.review-strata__filter-group legend {
  float: left;
  margin-inline-end: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.review-strata__filter {
  min-height: var(--ui-control-height);
  padding: var(--ui-space-1) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-inline-end: 0;
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  cursor: pointer;
}

.review-strata__filter:first-of-type {
  border-radius: var(--ui-radius) 0 0 var(--ui-radius);
}

.review-strata__filter:last-of-type {
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: 0 var(--ui-radius) var(--ui-radius) 0;
}

.review-strata__filter--selected {
  background: var(--ui-color-accent-soft);
  color: var(--ui-color-accent);
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

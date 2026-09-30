<script setup>
import UiChip from '../ui/UiChip.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

defineProps({
  candidates: { type: Array, default: () => [] },
  selectedCandidateId: { type: String, default: null },
  saving: { type: Boolean, default: false },
});

defineEmits(['select']);

const decisionLabels = Object.freeze({
  pending: '待審',
  approved: '已核准',
  rejected: '已拒絕',
});
const decisionTones = Object.freeze({
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
});

function decisionLabel(candidate) {
  return decisionLabels[candidate.decision] ?? '未知';
}

function decisionTone(candidate) {
  return decisionTones[candidate.decision] ?? 'muted';
}

function catalogReachLabel(candidate) {
  return candidate.catalogReach === 'mainstream' ? '主流' : '長尾';
}
</script>

<template>
  <aside class="review-candidates" aria-label="審核候選清單">
    <div class="review-candidates__header">
      <strong>候選清單</strong>
      <span>{{ candidates.length }} 筆</span>
    </div>
    <UiScrollRegion
      v-if="candidates.length"
      class="review-candidates__list"
      axis="vertical"
      viewport-tag="ol"
      viewport-class="review-candidates__list-viewport"
    >
      <li v-for="(candidate, index) in candidates" :key="candidate.id">
        <button
          type="button"
          class="review-candidates__row"
          :class="{
            'review-candidates__row--selected':
              selectedCandidateId === candidate.id,
          }"
          :aria-pressed="selectedCandidateId === candidate.id"
          :disabled="saving"
          @click="$emit('select', candidate.id)"
        >
          <span class="review-candidates__index">{{ index + 1 }}</span>
          <span class="review-candidates__identity">
            <strong dir="auto">{{ candidate.reference.artist }}</strong>
            <span dir="auto">{{ candidate.reference.title }}</span>
          </span>
          <UiChip
            :tone="
              candidate.catalogReach === 'mainstream' ? 'accent' : 'warning'
            "
          >
            {{ catalogReachLabel(candidate) }}
          </UiChip>
          <UiChip :tone="decisionTone(candidate)">
            {{ decisionLabel(candidate) }}
          </UiChip>
        </button>
      </li>
    </UiScrollRegion>
    <div v-else class="review-candidates__empty" role="status">
      目前篩選條件沒有候選項目。
    </div>
  </aside>
</template>

<style scoped>
.review-candidates {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
}

.review-candidates__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 2.5rem;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.review-candidates__header strong {
  color: var(--ui-color-text);
}

.review-candidates__list {
  min-height: 0;
}

.review-candidates__list :deep(.review-candidates__list-viewport) {
  padding: 0;
  margin: 0;
  list-style: none;
}

.review-candidates__row {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 3rem;
  display: grid;
  grid-template-columns: 2rem minmax(7rem, 1fr) auto auto;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.review-candidates__row:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
}

.review-candidates__row--selected {
  background: var(--ui-color-surface-selected);
  box-shadow: inset 2px 0 0 var(--ui-color-current);
}

.review-candidates__row:focus-visible {
  z-index: 1;
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.review-candidates__index {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.review-candidates__identity {
  min-width: 0;
  display: grid;
  gap: 0.125rem;
}

.review-candidates__identity strong,
.review-candidates__identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-candidates__identity strong {
  font-size: var(--ui-font-size-sm);
}

.review-candidates__identity span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.review-candidates__empty {
  padding: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  text-align: center;
}
</style>

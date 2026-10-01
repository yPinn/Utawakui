<script setup>
import UiChip from '../ui/UiChip.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  candidates: { type: Array, default: () => [] },
  selectedCandidateId: { type: String, default: null },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['select']);

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

function selectCandidate(candidateId) {
  if (!props.saving) emit('select', candidateId);
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
      <UiTrackRow
        v-for="(candidate, index) in candidates"
        :key="candidate.id"
        :title="candidate.reference.title"
        :artist="candidate.reference.artist"
        :active="selectedCandidateId === candidate.id"
        :interactive="!saving"
        :action-label="`審核 ${candidate.reference.artist} — ${candidate.reference.title}`"
        hide-duration
        overflow="ellipsis"
        @row-click="selectCandidate(candidate.id)"
      >
        <template #lead>
          <span class="review-candidates__index">{{ index + 1 }}</span>
        </template>
        <template #trail>
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
        </template>
      </UiTrackRow>
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
  min-height: var(--ui-control-height);
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
  padding: var(--ui-space-1) var(--ui-space-2);
  margin: 0;
  list-style: none;
}

.review-candidates__index {
  min-width: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.review-candidates__empty {
  padding: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  text-align: center;
}
</style>

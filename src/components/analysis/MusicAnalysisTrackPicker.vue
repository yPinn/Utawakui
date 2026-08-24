<script setup>
import { computed, shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  selectedTrackId: { type: String, default: '' },
  selectedLevel: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  batchSelectedTrackIds: { type: Array, default: () => [] },
  batchItemsByTrackId: { type: Object, default: () => ({}) },
});

const emit = defineEmits([
  'select',
  'toggleBatch',
  'selectVisible',
  'clearBatch',
]);
const query = shallowRef('');

const BATCH_STATUS = Object.freeze({
  pending: { label: '等待', tone: 'muted' },
  checking: { label: '檢查中', tone: 'info' },
  running: { label: '分析中', tone: 'info' },
  completed: { label: '完成', tone: 'success' },
  failed: { label: '失敗', tone: 'danger' },
  skipped: { label: '略過', tone: 'muted' },
  cancelled: { label: '已取消', tone: 'warning' },
});

const visibleTracks = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase();
  if (!normalized) return props.tracks;
  return props.tracks.filter((track) =>
    `${track.title ?? ''} ${track.artist ?? ''}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
});

function selectTrack(trackId) {
  if (!props.disabled) emit('select', trackId);
}

function isBatchSelected(trackId) {
  return props.batchSelectedTrackIds.includes(trackId);
}

function toggleBatch(trackId) {
  if (!props.disabled) emit('toggleBatch', trackId);
}

function selectVisible() {
  if (!props.disabled) {
    emit(
      'selectVisible',
      visibleTracks.value.map(({ id }) => id),
    );
  }
}

function batchStatus(trackId) {
  return BATCH_STATUS[props.batchItemsByTrackId[trackId]?.status] ?? null;
}
</script>

<template>
  <section class="analysis-picker" aria-labelledby="analysis-track-heading">
    <div class="analysis-picker__heading-row">
      <div>
        <h2 id="analysis-track-heading" class="analysis-picker__heading">
          曲目
        </h2>
        <p class="analysis-picker__count">{{ tracks.length }} 首本機曲目</p>
      </div>
      <UiChip v-if="selectedLevel" tone="info">{{ selectedLevel }}</UiChip>
    </div>

    <UiSearchBox v-model="query" placeholder="搜尋可分析曲目" />

    <div class="analysis-picker__batch-tools">
      <span class="analysis-picker__selected-count">
        已選 {{ batchSelectedTrackIds.length }} 首
      </span>
      <div class="analysis-picker__batch-actions">
        <UiButton
          :disabled="disabled || visibleTracks.length === 0"
          @click="selectVisible"
        >
          選取篩選結果
        </UiButton>
        <UiButton
          :disabled="disabled || batchSelectedTrackIds.length === 0"
          @click="emit('clearBatch')"
        >
          清除
        </UiButton>
      </div>
    </div>

    <UiHint v-if="loading" padded>正在讀取本機曲庫…</UiHint>
    <UiHint v-else-if="visibleTracks.length === 0" padded center>
      {{
        tracks.length === 0 ? '曲庫目前沒有可分析曲目。' : '沒有符合的曲目。'
      }}
    </UiHint>
    <ul v-else class="analysis-picker__list">
      <UiTrackRow
        v-for="track in visibleTracks"
        :key="track.id"
        :track="track"
        :active="track.id === selectedTrackId"
        :interactive="!disabled"
        :aria-current="track.id === selectedTrackId ? 'true' : undefined"
        :aria-pressed="!disabled ? track.id === selectedTrackId : undefined"
        :aria-disabled="disabled || undefined"
        @click="selectTrack(track.id)"
      >
        <template #lead>
          <input
            class="analysis-picker__checkbox"
            type="checkbox"
            :checked="isBatchSelected(track.id)"
            :disabled="disabled"
            :aria-label="`選取${track.title ?? track.id}進行批次分析`"
            @click.stop
            @change="toggleBatch(track.id)"
          />
        </template>
        <template #trail>
          <UiChip
            v-if="batchStatus(track.id)"
            :tone="batchStatus(track.id).tone"
          >
            {{ batchStatus(track.id).label }}
          </UiChip>
        </template>
      </UiTrackRow>
    </ul>
  </section>
</template>

<style scoped>
.analysis-picker {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.analysis-picker__heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.analysis-picker__heading,
.analysis-picker__count {
  margin: 0;
}

.analysis-picker__heading {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.analysis-picker__count {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.analysis-picker :deep(.ui-search-box) {
  width: 100%;
}

.analysis-picker__batch-tools,
.analysis-picker__batch-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.analysis-picker__batch-tools {
  justify-content: space-between;
  min-width: 0;
}

.analysis-picker__batch-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.analysis-picker__batch-actions :deep(.ui-btn) {
  min-height: auto;
  padding-block: calc(var(--ui-space-1) / 2);
}

.analysis-picker__selected-count {
  flex-shrink: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.analysis-picker__checkbox {
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  flex: 0 0 var(--ui-space-4);
  margin: 0;
  accent-color: var(--ui-color-accent);
}

.analysis-picker__list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (max-width: 520px) {
  .analysis-picker__batch-tools {
    align-items: flex-start;
    flex-direction: column;
  }

  .analysis-picker__batch-actions {
    justify-content: flex-start;
  }
}
</style>

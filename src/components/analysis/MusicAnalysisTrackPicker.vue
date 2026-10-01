<script setup>
import { computed, shallowRef } from 'vue';
import { rangeTrackIds } from '../../utils/musicAnalysisSelection.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import MusicAnalysisSelectionToolbar from './MusicAnalysisSelectionToolbar.vue';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  mode: {
    type: String,
    default: 'single',
    validator: (value) => ['single', 'batch'].includes(value),
  },
  selectedTrackId: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  batchAvailable: { type: Boolean, default: true },
  batchSelectedTrackIds: { type: Array, default: () => [] },
  batchItemsByTrackId: { type: Object, default: () => ({}) },
});

const emit = defineEmits([
  'select',
  'modeChange',
  'setBatchSelection',
  'clearBatch',
]);
const query = shallowRef('');
const lastBatchAnchorId = shallowRef('');

const BATCH_STATUS = Object.freeze({
  checking: { label: '檢查中', tone: 'info' },
  running: { label: '分析中', tone: 'info' },
  failed: { label: '失敗', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'warning' },
});
const ANALYSIS_MODES = Object.freeze([
  { id: 'single', label: '單曲' },
  { id: 'batch', label: '批次選取' },
]);

const batchMode = computed(() => props.mode === 'batch');
const modeItems = computed(() =>
  ANALYSIS_MODES.map((item) => ({
    ...item,
    disabled:
      props.disabled ||
      (item.id === 'batch' && !props.batchAvailable && !batchMode.value),
  })),
);

const visibleTracks = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase();
  if (!normalized) return props.tracks;
  return props.tracks.filter((track) =>
    `${track.title ?? ''} ${track.artist ?? ''}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
});
const visibleTrackIds = computed(() => visibleTracks.value.map(({ id }) => id));
const visibleSelectedCount = computed(
  () =>
    visibleTrackIds.value.filter((trackId) => isBatchSelected(trackId)).length,
);
const allVisibleSelected = computed(
  () =>
    visibleTrackIds.value.length > 0 &&
    visibleSelectedCount.value === visibleTrackIds.value.length,
);
const someVisibleSelected = computed(() => visibleSelectedCount.value > 0);

function changeMode(mode) {
  if (props.disabled || mode === props.mode) return;
  lastBatchAnchorId.value = '';
  emit('modeChange', mode);
}

function isBatchSelected(trackId) {
  return props.batchSelectedTrackIds.includes(trackId);
}

function activateTrack(trackId, event) {
  if (props.disabled) return;
  if (!batchMode.value) {
    emit('select', trackId);
    return;
  }
  const trackIds = event?.shiftKey
    ? rangeTrackIds(visibleTrackIds.value, lastBatchAnchorId.value, trackId)
    : [trackId];
  emit('setBatchSelection', {
    trackIds,
    selected: !isBatchSelected(trackId),
  });
  lastBatchAnchorId.value = trackId;
}

function setVisibleSelection(selected) {
  if (props.disabled) return;
  emit('setBatchSelection', {
    trackIds: visibleTrackIds.value,
    selected,
  });
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
      <UiSegmentedControl
        class="analysis-picker__mode"
        :items="modeItems"
        :model-value="mode"
        aria-label="分析模式"
        @update:model-value="changeMode"
      />
    </div>

    <UiSearchBox v-model="query" placeholder="搜尋可分析曲目" />

    <UiHint v-if="!batchAvailable && !batchMode" tone="warning">
      請先到設定準備 BPM 分析，才能使用批次重跑。
    </UiHint>

    <MusicAnalysisSelectionToolbar
      v-if="batchMode"
      :visible-count="visibleTracks.length"
      :selected-count="batchSelectedTrackIds.length"
      :all-visible-selected="allVisibleSelected"
      :some-visible-selected="someVisibleSelected"
      :disabled="disabled"
      @set-visible="setVisibleSelection"
      @clear="emit('clearBatch')"
    />

    <UiHint v-if="loading" padded>正在讀取本機曲庫…</UiHint>
    <UiHint v-else-if="visibleTracks.length === 0" padded center>
      {{
        tracks.length === 0 ? '曲庫目前沒有可分析曲目。' : '沒有符合的曲目。'
      }}
    </UiHint>
    <UiScrollRegion
      v-else
      class="analysis-picker__list"
      axis="vertical"
      viewport-tag="ul"
      viewport-class="analysis-picker__list-viewport"
    >
      <UiTrackRow
        v-for="track in visibleTracks"
        :key="track.id"
        :track="track"
        :class="{
          'analysis-picker__batch-row': batchMode && !disabled,
        }"
        :active="
          batchMode ? isBatchSelected(track.id) : track.id === selectedTrackId
        "
        :interactive="!disabled && !batchMode"
        :action-label="`選取：${track.title ?? track.id}`"
        :hide-duration="batchMode"
        :aria-current="
          !batchMode && track.id === selectedTrackId ? 'true' : undefined
        "
        :aria-disabled="disabled || undefined"
        @row-click="activateTrack(track.id, $event)"
      >
        <template #lead>
          <span v-if="batchMode" class="analysis-picker__checkbox-control">
            <UiCheckbox
              :id="`music-analysis-batch-track-${track.id}`"
              class="analysis-picker__checkbox"
              :model-value="isBatchSelected(track.id)"
              :disabled="disabled"
              :label="`選取${track.title ?? track.id}進行批次分析`"
              label-hidden
              @click.stop.prevent="activateTrack(track.id, $event)"
            />
          </span>
        </template>
        <template #trail>
          <UiChip
            v-if="batchMode && batchStatus(track.id)"
            :tone="batchStatus(track.id).tone"
          >
            {{ batchStatus(track.id).label }}
          </UiChip>
        </template>
      </UiTrackRow>
    </UiScrollRegion>
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
  align-items: center;
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

.analysis-picker__mode {
  max-width: 16rem;
}

.analysis-picker__checkbox-control {
  width: var(--ui-control-height);
  height: var(--ui-control-height);
  flex: 0 0 var(--ui-control-height);
  display: inline-grid;
  place-items: center;
}

.analysis-picker__checkbox :deep(.ui-field__control) {
  display: inline-grid;
  place-items: center;
}

.analysis-picker__batch-row {
  cursor: pointer;
}

.analysis-picker__batch-row:hover {
  background: var(--ui-color-surface-hover);
}

.analysis-picker__list {
  min-height: 0;
  flex: 1;
}

.analysis-picker__list :deep(.analysis-picker__list-viewport) {
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (max-width: 520px) {
  .analysis-picker__heading-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

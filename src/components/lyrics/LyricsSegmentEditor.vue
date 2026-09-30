<script setup>
import { computed, shallowRef, watch } from 'vue';
import { Clock, Minus, Plus } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

const props = defineProps({
  draft: { type: Object, required: true },
  canTap: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
});

const emit = defineEmits(['tap', 'nudge-boundary']);

const selectedBoundaryIndex = shallowRef(null);

const nextBoundaryIndex = computed(() =>
  props.draft.segments.findIndex(
    (segment, index) => index > 0 && !Number.isFinite(segment.startMs),
  ),
);

const nextSegmentLabel = computed(() => {
  const index = nextBoundaryIndex.value;
  return index > 0 ? segmentLabel(props.draft.segments[index]) : '';
});

const selectedBoundary = computed(() => {
  const index = selectedBoundaryIndex.value;
  if (!Number.isInteger(index) || index <= 0) return null;
  const segment = props.draft.segments[index];
  return Number.isFinite(segment?.startMs) ? { index, segment } : null;
});

watch(
  () => props.draft.lineId,
  () => {
    selectedBoundaryIndex.value = null;
  },
);

watch(
  () =>
    selectedBoundaryIndex.value === null
      ? null
      : props.draft.segments[selectedBoundaryIndex.value]?.startMs,
  (startMs) => {
    if (selectedBoundaryIndex.value !== null && !Number.isFinite(startMs)) {
      selectedBoundaryIndex.value = null;
    }
  },
);

function segmentLabel(segment) {
  return String(segment?.text ?? '').trim() || '空白';
}

function timeLabel(milliseconds) {
  return Number.isFinite(milliseconds)
    ? `${(milliseconds / 1000).toFixed(2)} 秒`
    : '--';
}

function segmentState(index) {
  if (index === 0 || Number.isFinite(props.draft.segments[index]?.startMs)) {
    return 'recorded';
  }
  return index === nextBoundaryIndex.value ? 'current' : 'pending';
}

function segmentAriaLabel(segment, index) {
  const label = segmentLabel(segment);
  if (index === 0) return `「${label}」為本行起點`;
  if (Number.isFinite(segment.startMs)) {
    return `選取「${label}」的起點 ${timeLabel(segment.startMs)}`;
  }
  return index === nextBoundaryIndex.value
    ? `「${label}」是下一個待記錄起點`
    : `「${label}」尚待記錄`;
}

function selectBoundary(index) {
  if (index > 0 && Number.isFinite(props.draft.segments[index]?.startMs)) {
    selectedBoundaryIndex.value = index;
  }
}

function nudgeSelected(deltaMs) {
  const boundary = selectedBoundary.value;
  if (boundary) emit('nudge-boundary', boundary.index, deltaMs);
}
</script>

<template>
  <div class="lyrics-segment-editor" aria-label="逐字片段編輯器">
    <UiScrollRegion
      class="lyrics-segment-editor__sequence"
      axis="horizontal"
      viewport-tag="ol"
      viewport-class="lyrics-segment-editor__sequence-viewport"
      aria-label="逐字起點順序"
    >
      <li
        v-for="(segment, index) in draft.segments"
        :key="segment.segmentId"
        class="lyrics-segment-editor__item"
      >
        <button
          type="button"
          class="lyrics-segment-editor__word"
          :class="[
            `lyrics-segment-editor__word--${segmentState(index)}`,
            {
              'lyrics-segment-editor__word--selected':
                selectedBoundaryIndex === index,
            },
          ]"
          :disabled="index === 0 || !Number.isFinite(segment.startMs)"
          :aria-current="index === nextBoundaryIndex ? 'step' : undefined"
          :aria-label="segmentAriaLabel(segment, index)"
          @click="selectBoundary(index)"
        >
          <span class="lyrics-segment-editor__word-text">
            {{ segmentLabel(segment) }}
          </span>
          <span class="lyrics-segment-editor__word-time">
            {{
              index === 0
                ? '本行起點'
                : Number.isFinite(segment.startMs)
                  ? timeLabel(segment.startMs)
                  : index === nextBoundaryIndex
                    ? '下一個'
                    : '待記錄'
            }}
          </span>
        </button>
      </li>
    </UiScrollRegion>

    <div v-if="nextBoundaryIndex > 0" class="lyrics-segment-editor__workflow">
      <div class="lyrics-segment-editor__workflow-copy">
        <span class="lyrics-segment-editor__eyebrow">下一個起點：</span>
        <strong>「{{ nextSegmentLabel }}」</strong>
      </div>
      <UiButton
        :icon="Clock"
        variant="accent"
        :disabled="!canTap || isSaving"
        :aria-label="`記錄「${nextSegmentLabel}」起點`"
        :title="`以目前播放位置記錄「${nextSegmentLabel}」起點`"
        @click="emit('tap')"
      >
        記錄位置
      </UiButton>
    </div>
    <div v-else class="lyrics-segment-editor__complete" role="status">
      起點已全部記錄；選取上方詞語可微調時間。
    </div>

    <div
      v-if="selectedBoundary"
      class="lyrics-segment-editor__adjustment"
      aria-label="微調已記錄起點"
    >
      <div class="lyrics-segment-editor__adjustment-copy">
        <span class="lyrics-segment-editor__eyebrow">微調起點</span>
        <strong>
          「{{ segmentLabel(selectedBoundary.segment) }}」
          {{ timeLabel(selectedBoundary.segment.startMs) }}
        </strong>
      </div>
      <div class="lyrics-segment-editor__adjustment-actions">
        <UiButton
          :icon="Minus"
          :disabled="isSaving"
          :aria-label="`將「${segmentLabel(selectedBoundary.segment)}」提前 0.1 秒`"
          title="提前 0.1 秒"
          @click="nudgeSelected(-100)"
        >
          提前 0.1 秒
        </UiButton>
        <UiButton
          :icon="Plus"
          :disabled="isSaving"
          :aria-label="`將「${segmentLabel(selectedBoundary.segment)}」延後 0.1 秒`"
          title="延後 0.1 秒"
          @click="nudgeSelected(100)"
        >
          延後 0.1 秒
        </UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyrics-segment-editor {
  display: grid;
  gap: var(--ui-space-2);
  min-width: 0;
  padding: 0 var(--ui-space-4) var(--ui-space-3);
  background: var(--ui-color-surface-raised);
}

.lyrics-segment-editor__sequence {
  min-width: 0;
}

.lyrics-segment-editor__sequence
  :deep(.lyrics-segment-editor__sequence-viewport) {
  display: flex;
  align-items: stretch;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-1) 0;
  list-style: none;
}

.lyrics-segment-editor__item {
  flex: 0 0 auto;
}

.lyrics-segment-editor__word {
  display: grid;
  gap: var(--ui-space-1);
  min-width: 4rem;
  height: 100%;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.lyrics-segment-editor__word:disabled {
  cursor: default;
  opacity: 1;
}

.lyrics-segment-editor__word--pending {
  color: var(--ui-color-text-muted);
  border-style: dashed;
  background: transparent;
}

.lyrics-segment-editor__word--current {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-accent-soft);
}

.lyrics-segment-editor__word--selected {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.lyrics-segment-editor__word:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-segment-editor__word-text {
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
}

.lyrics-segment-editor__word-time,
.lyrics-segment-editor__eyebrow,
.lyrics-segment-editor__complete {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-segment-editor__word-time {
  font-variant-numeric: tabular-nums;
}

.lyrics-segment-editor__workflow,
.lyrics-segment-editor__adjustment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  min-width: 0;
  padding-top: var(--ui-space-2);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-segment-editor__workflow-copy,
.lyrics-segment-editor__adjustment-copy {
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
  color: var(--ui-color-text);
}

.lyrics-segment-editor__adjustment-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

@container (max-width: 42rem) {
  .lyrics-segment-editor__workflow,
  .lyrics-segment-editor__adjustment {
    align-items: stretch;
    flex-direction: column;
  }

  .lyrics-segment-editor__workflow :deep(.ui-btn),
  .lyrics-segment-editor__adjustment-actions {
    align-self: flex-start;
  }
}
</style>

<script setup>
import { Minus, Plus } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';

defineProps({
  draft: { type: Object, required: true },
});

defineEmits(['nudge-boundary']);

function timeLabel(milliseconds) {
  return Number.isFinite(milliseconds)
    ? `${(milliseconds / 1000).toFixed(2)}s`
    : '--';
}
</script>

<template>
  <div class="lyrics-segment-editor" aria-label="逐字片段編輯器">
    <div
      v-for="(segment, index) in draft.segments"
      :key="segment.segmentId"
      class="lyrics-segment-editor__segment"
    >
      <div v-if="index > 0" class="lyrics-segment-editor__boundary">
        <UiButton
          :icon="Minus"
          :aria-label="`將第 ${index + 1} 段提前 0.1 秒`"
          :title="`將第 ${index + 1} 段提前 0.1 秒`"
          @click="$emit('nudge-boundary', index, -100)"
        />
        <span>{{ timeLabel(segment.startMs) }}</span>
        <UiButton
          :icon="Plus"
          :aria-label="`將第 ${index + 1} 段延後 0.1 秒`"
          :title="`將第 ${index + 1} 段延後 0.1 秒`"
          @click="$emit('nudge-boundary', index, 100)"
        />
      </div>
      <span class="lyrics-segment-editor__text">{{ segment.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.lyrics-segment-editor {
  display: flex;
  align-items: flex-end;
  gap: var(--ui-space-1);
  min-width: 0;
  padding: var(--ui-space-2) var(--ui-space-4);
  overflow-x: auto;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-segment-editor__segment {
  display: flex;
  align-items: flex-end;
  gap: var(--ui-space-1);
  white-space: pre;
}

.lyrics-segment-editor__boundary {
  display: grid;
  justify-items: center;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-xs);
  font-variant-numeric: tabular-nums;
}

.lyrics-segment-editor__text {
  padding-bottom: var(--ui-space-2);
  color: var(--ui-color-text);
}
</style>

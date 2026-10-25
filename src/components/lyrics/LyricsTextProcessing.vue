<script setup>
import { useId } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';

const { lyricsTextProcessing, selectedSource, state } = useLyrics();
const { candidates, hiddenLineIds, setHidden, restore } = lyricsTextProcessing;
const id = useId();
function candidateLabel(line) {
  const action = line.outputLabelRanges?.length ? '片段' : '整行';
  return `第 ${line.sourceLineIndex + 1} 行 · ${action}：${line.text}`;
}
</script>

<template>
  <UiDisclosure
    v-if="selectedSource"
    class="lyrics-text-processing"
    label="共用文字處理"
  >
    <div class="lyrics-text-processing__body">
      <UiHint>勾選項目只在 Output 隱藏，原歌詞與時間不變。</UiHint>
      <UiHint v-if="!candidates.length">沒有待處理項目。</UiHint>
      <UiCheckbox
        v-for="(line, index) in candidates"
        :id="`${id}-credit-${index}`"
        :key="line.lineId"
        :label="candidateLabel(line)"
        :model-value="hiddenLineIds.includes(line.lineId)"
        :disabled="state.isLoadingLyrics"
        @update:model-value="setHidden(line.lineId, $event)"
      />
      <div v-if="hiddenLineIds.length" class="lyrics-text-processing__actions">
        <UiButton variant="accent" @click="restore">全部還原</UiButton>
      </div>
    </div>
  </UiDisclosure>
</template>

<style scoped>
.lyrics-text-processing__body {
  display: grid;
  gap: var(--ui-space-2);
  min-width: 0;
  overflow-wrap: anywhere;
}
.lyrics-text-processing__actions {
  display: flex;
  justify-content: flex-end;
}
</style>

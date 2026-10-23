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
</script>

<template>
  <UiDisclosure
    v-if="selectedSource"
    class="lyrics-text-processing"
    label="共用文字處理"
  >
    <div class="lyrics-text-processing__body">
      <UiHint
        >製作資訊僅列為候選，預設全部保留。對唱、和聲與括號內的歌詞不自動隱藏。</UiHint
      >
      <UiHint
        >勾選後僅在所有 Output
        模板隱藏這一行；本機原文與校時保留。切換來源或原文變更後重設。</UiHint
      >
      <UiHint v-if="!candidates.length">此來源沒有製作資訊候選。</UiHint>
      <UiCheckbox
        v-for="(line, index) in candidates"
        :id="`${id}-credit-${index}`"
        :key="line.lineId"
        :label="`隱藏第 ${line.sourceLineIndex + 1} 行：${line.text}`"
        :model-value="hiddenLineIds.includes(line.lineId)"
        :disabled="state.isLoadingLyrics"
        @update:model-value="setHidden(line.lineId, $event)"
      />
      <UiButton v-if="hiddenLineIds.length" @click="restore"
        >恢復全部原文輸出</UiButton
      >
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
</style>

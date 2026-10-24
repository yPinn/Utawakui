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
  const action = line.outputLabelRanges?.length ? '隱藏提示標記' : '隱藏整行';
  return `${action}（第 ${line.sourceLineIndex + 1} 行）：${line.text}`;
}
</script>

<template>
  <UiDisclosure
    v-if="selectedSource"
    class="lyrics-text-processing"
    label="共用文字處理"
  >
    <div class="lyrics-text-processing__body">
      <UiHint
        >明確製作欄位預設從 Output
        隱藏；明確聲部、已確認的歌手前綴與純和聲提示也預設隱藏，可取消勾選還原。其餘候選由你確認。</UiHint
      >
      <UiHint
        >只影響所有畫面輸出模板，原歌詞與校時不變。實唱、對唱與和聲唱詞保留，角色資訊留在內部；更換或修改歌詞後回到預設過濾。</UiHint
      >
      <UiHint v-if="!candidates.length"
        >未找到可隱藏的製作資訊或提示標記。</UiHint
      >
      <UiCheckbox
        v-for="(line, index) in candidates"
        :id="`${id}-credit-${index}`"
        :key="line.lineId"
        :label="candidateLabel(line)"
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

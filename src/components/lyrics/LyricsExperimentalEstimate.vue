<script setup>
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import { useLyrics } from '../../composables/useLyrics.js';
const experiment = useLyrics().experimentalLyrics;
defineProps({ disabled: { type: Boolean, default: false } });
</script>

<template>
  <div
    v-if="
      experiment &&
      (experiment.needsReanalysis.value ||
        experiment.estimate.value.status !== 'missing') &&
      experiment.estimate.value.status !== 'disabled'
    "
    class="lyrics-experimental-estimate"
  >
    <UiHint>{{
      experiment.needsReanalysis.value
        ? '校時已變更，請至可用歌詞重新分析；目前沿用來源時間。'
        : experiment.prepared.value.status === 'ready'
          ? '實驗詞塊已產生；尚未通過人工時間驗收。套用至歌詞與支援詞塊的 Output 模板，來源 T2 優先，無可用詞塊時沿用 T1。'
          : '實驗詞塊目前不可用，沿用原有歌詞。'
    }}</UiHint>
    <UiButton
      :active="experiment.applied.value"
      :aria-pressed="experiment.applied.value"
      :disabled="disabled || experiment.prepared.value.status !== 'ready'"
      @click="experiment.setApplied(!experiment.applied.value)"
      >{{
        experiment.applied.value ? '停用實驗詞塊' : '套用實驗詞塊'
      }}</UiButton
    >
  </div>
</template>

<style scoped>
.lyrics-experimental-estimate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
}
</style>

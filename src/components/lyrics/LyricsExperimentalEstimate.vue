<script setup>
import { computed } from 'vue';
import { summarizeAcousticPreview } from '../../../shared/presentation/lyricsAcousticPreview.mjs';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import { useLyrics } from '../../composables/useLyrics.js';
const experiment = useLyrics().experimentalLyrics;
const summary = computed(() =>
  summarizeAcousticPreview(experiment?.prepared.value),
);
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
        ? '校時已變更，請重新分析；目前沿用原歌詞。'
        : experiment.prepared.value.status === 'ready'
          ? `分析${experiment.applied.value ? '已套用' : '未套用'} · ${summary.fineLines ? `${summary.fineLines} 句有分段時間` : '僅分段提示'}${experiment.estimate.value.compatibility?.rule === 'normalizer-v2-v3-exact-v1' ? ' · 沿用既有分析，時間未變' : ''}`
          : '分析目前不可用，沿用原歌詞。'
    }}</UiHint>
    <UiButton
      :active="experiment.applied.value"
      :aria-pressed="experiment.applied.value"
      :disabled="disabled || experiment.prepared.value.status !== 'ready'"
      @click="experiment.setApplied(!experiment.applied.value)"
      >{{ experiment.applied.value ? '停用分析' : '套用分析' }}</UiButton
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

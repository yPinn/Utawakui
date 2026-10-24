<script setup>
import { computed } from 'vue';
import { summarizeAcousticPreview } from '../../../shared/presentation/lyricsAcousticPreview.mjs';
import UiButton from '../ui/UiButton.vue';
import { useLyrics } from '../../composables/useLyrics.js';
const experiment = useLyrics().experimentalLyrics;
const summary = computed(() =>
  summarizeAcousticPreview(experiment?.prepared.value),
);
const props = defineProps({ disabled: { type: Boolean, default: false } });
const blocked = computed(
  () => props.disabled || experiment?.prepared.value.status !== 'ready',
);
const description = computed(() => {
  if (!experiment) return '';
  const status = experiment.needsReanalysis.value
    ? '校時已變更，請重新分析；目前沿用原歌詞。'
    : experiment.prepared.value.status === 'ready'
      ? `${experiment.applied.value ? '關閉分析顯示，恢復原歌詞時間。' : '開啟分析顯示，使用已產生的歌詞時間提示。'}${summary.value.fineLines ? `${summary.value.fineLines} 句有分段時間` : '僅分段提示'}${experiment.estimate.value.compatibility?.rule === 'normalizer-v2-v3-exact-v1' ? ' · 沿用既有分析，時間未變' : ''}`
      : '分析目前不可用，沿用原歌詞。';
  return `實驗性歌詞時間提示。${status}${props.disabled ? ' 請先結束編輯，再切換分析顯示。' : ''}`;
});
function toggleApplied() {
  if (!blocked.value) experiment.setApplied(!experiment.applied.value);
}
</script>

<template>
  <UiButton
    v-if="
      experiment &&
      (experiment.needsReanalysis.value ||
        experiment.estimate.value.status !== 'missing') &&
      experiment.estimate.value.status !== 'disabled'
    "
    :active="experiment.applied.value"
    :aria-pressed="experiment.applied.value"
    :aria-disabled="blocked"
    :aria-description="description"
    :title="description"
    @click="toggleApplied"
  >
    分析顯示
  </UiButton>
</template>

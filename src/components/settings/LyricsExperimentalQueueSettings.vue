<script setup>
import { computed, onMounted, onUnmounted, shallowRef, useId } from 'vue';
import { useExperimentalLyricsQueue } from '../../composables/lyrics/useExperimentalLyricsQueue.js';
import { useLibrary } from '../../composables/useLibrary.js';
import SettingsSection from './SettingsSection.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
const queue = useExperimentalLyricsQueue();
const library = useLibrary();
const id = `lyrics-experimental-${useId()}`,
  saving = shallowRef(false);
let timer;
const items = computed(() =>
  (queue.state.value?.items ?? []).map((item) => ({
    ...item,
    title:
      library.state.tracks.find((track) => track.id === item.trackId)?.title ||
      '曲庫歌曲',
    label: {
      pending: '等待分析',
      running: '分析中',
      ready: '已產生，請至歌詞頁手動套用',
      failed: '分析失敗，伴奏仍可用',
      cancelled: '已取消，伴奏仍可用',
      skipped:
        item.reason === 'environment-missing'
          ? '已跳過：請先下載並驗證環境'
          : '已跳過：沒有支援的中／日整句歌詞',
    }[item.status],
  })),
);
async function setEnabled(value) {
  saving.value = true;
  try {
    await queue.setEnabled(value);
  } finally {
    saving.value = false;
  }
}
onMounted(() => {
  void queue.refresh();
  timer = setInterval(() => {
    if (queue.state.value?.enabled || items.value.length) void queue.refresh();
  }, 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <SettingsSection title="實驗性詞塊分析">
    <UiCheckbox
      :id="id"
      label="伴奏完成後自動產生詞塊"
      :model-value="queue.state.value?.enabled === true"
      :disabled="
        saving ||
        !queue.state.value ||
        (!queue.state.value.allowed && !queue.state.value.enabled)
      "
      hint="預設關閉。僅產生獨立估計，請至歌詞頁手動套用；不會自動下載模型，也不會改寫原有歌詞。"
      @update:model-value="setEnabled"
    />
    <UiHint
      >先在上方本機研究試用手動下載 HubertFA ＋ Whisper
      small。啟用後處理新完成的伴奏；中／日整句歌詞適用，原生 T2 優先，其他沿用
      T1。人工時間驗收尚未完成，權重與字典授權範圍仍待釐清。</UiHint
    >
    <UiHint v-if="queue.state.value && !queue.state.value.allowed"
      >請先啟用音訊處理功能。</UiHint
    >
    <p v-if="queue.error.value" role="alert">{{ queue.error.value }}</p>
    <div
      v-for="item in items"
      :key="item.trackId"
      class="lyrics-experimental-queue__item"
    >
      <span role="status">{{ item.title }} · {{ item.label }}</span>
      <UiButton
        v-if="['pending', 'running'].includes(item.status)"
        @click="queue.cancel(item.trackId)"
        >取消詞塊分析</UiButton
      >
      <UiButton
        v-else-if="['failed', 'cancelled', 'skipped'].includes(item.status)"
        :disabled="!queue.state.value?.enabled || !queue.state.value?.allowed"
        @click="queue.retry(item.trackId)"
        >重試詞塊分析</UiButton
      >
    </div>
  </SettingsSection>
</template>

<style scoped>
.lyrics-experimental-queue__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-2);
  overflow-wrap: anywhere;
}
</style>

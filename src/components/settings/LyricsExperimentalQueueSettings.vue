<script setup>
import { computed, onMounted, onUnmounted, shallowRef, useId } from 'vue';
import { useExperimentalLyricsQueue } from '../../composables/lyrics/useExperimentalLyricsQueue.js';
import { useLibrary } from '../../composables/useLibrary.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { Captions } from '../../icons/index.js';
const queue = useExperimentalLyricsQueue();
const library = useLibrary();
const id = `lyrics-experimental-${useId()}`,
  saving = shallowRef(false);
let timer;
const items = computed(() =>
  (queue.state.value?.items ?? []).map((item) => ({
    ...item,
    statusLabel: {
      pending: '等待分析',
      running: '分析中',
      ready: '待套用',
      failed: '分析失敗',
      cancelled: '已取消',
      skipped: '已跳過',
    }[item.status],
    statusTone:
      item.status === 'running'
        ? 'info'
        : item.status === 'failed'
          ? 'danger'
          : item.status === 'ready'
            ? 'success'
            : 'muted',
    title:
      library.state.tracks.find((track) => track.id === item.trackId)?.title ||
      '曲庫歌曲',
    label: {
      pending: '',
      running: '',
      ready: '已產生，請至歌詞頁手動套用',
      failed: '伴奏仍可使用，可重試分析。',
      cancelled: '伴奏仍可使用，可重新分析。',
      skipped:
        item.reason === 'environment-missing'
          ? '請先下載並檢查分析工具。'
          : '沒有可分析的中文或日文歌詞。',
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
  <div class="lyrics-experimental-queue">
    <SettingsDocumentItem
      :icon="Captions"
      title="伴奏完成後分析歌詞"
      description="只分析新完成的伴奏，產生後請至歌詞頁手動套用。"
      guidance="不會自動下載工具或改寫原歌詞；優先使用原有逐字時間，無法分段時按整句顯示。"
    >
      <template #actions>
        <UiCheckbox
          :id="id"
          label="自動分析"
          aria-label="伴奏完成後自動分析歌詞"
          :model-value="queue.state.value?.enabled === true"
          :disabled="
            saving ||
            !queue.state.value ||
            (!queue.state.value.allowed && !queue.state.value.enabled)
          "
          @update:model-value="setEnabled"
        />
      </template>
      <template
        v-if="
          queue.error.value || !queue.state.value || !queue.state.value.allowed
        "
        #feedback
      >
        <UiHint v-if="queue.state.value && !queue.state.value.allowed"
          >請先啟用音訊處理功能。</UiHint
        >
        <UiHint v-if="queue.error.value" tone="danger" role="alert">{{
          queue.error.value
        }}</UiHint>
        <UiHint v-else-if="!queue.state.value" role="status"
          >讀取中；尚未確認自動分析設定。</UiHint
        >
      </template>
    </SettingsDocumentItem>
    <SettingsDocumentItem
      v-for="item in items"
      :key="item.trackId"
      :title="item.title"
      :guidance="item.label"
      :status="item.statusLabel"
      :status-tone="item.statusTone"
      status-live
      variant="nested"
    >
      <template #actions>
        <UiButton
          v-if="['pending', 'running'].includes(item.status)"
          variant="secondary"
          @click="queue.cancel(item.trackId)"
          >取消分析</UiButton
        >
        <UiButton
          v-else-if="['failed', 'cancelled', 'skipped'].includes(item.status)"
          variant="ghost"
          :disabled="!queue.state.value?.enabled || !queue.state.value?.allowed"
          @click="queue.retry(item.trackId)"
          >重試分析</UiButton
        >
      </template>
    </SettingsDocumentItem>
  </div>
</template>

<style scoped>
.lyrics-experimental-queue {
  min-inline-size: 0;
}
.lyrics-experimental-queue > :deep(* + *) {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
</style>

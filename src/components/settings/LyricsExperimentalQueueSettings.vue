<script setup>
import { onMounted, onUnmounted, shallowRef, useId } from 'vue';
import { useExperimentalLyricsQueue } from '../../composables/lyrics/useExperimentalLyricsQueue.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { Captions } from '../../icons/index.js';

const queue = useExperimentalLyricsQueue();
const id = `lyrics-experimental-${useId()}`;
const saving = shallowRef(false);
let timer;

async function setEnabled(value) {
  if (saving.value || !queue.state.value) return;
  saving.value = true;
  try {
    await queue.setEnabled(value);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void queue.refresh();
  // Keep the prerequisite current when its gate changes on this page.
  timer = setInterval(() => void queue.refresh(), 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <SettingsDocumentItem
    :icon="Captions"
    title="伴奏完成後分析歌詞"
    guidance="分析新完成的伴奏；結果、重試與套用請至歌詞頁。不會自動下載工具或改寫原歌詞。"
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
      <UiHint
        v-if="
          queue.readError.value && queue.readError.value !== queue.error.value
        "
        tone="danger"
        role="alert"
        >{{ queue.readError.value }}</UiHint
      >
      <UiHint v-if="!queue.state.value && !queue.error.value" role="status"
        >讀取中；尚未確認自動分析設定。</UiHint
      >
      <UiButton
        v-if="queue.readError.value"
        variant="ghost"
        @click="queue.refresh"
        >重新讀取</UiButton
      >
    </template>
  </SettingsDocumentItem>
</template>

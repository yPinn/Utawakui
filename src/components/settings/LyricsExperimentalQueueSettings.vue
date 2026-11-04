<script setup>
import { onMounted, onUnmounted, shallowRef, useId } from 'vue';
import { useExperimentalLyricsQueue } from '../../composables/lyrics/useExperimentalLyricsQueue.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { Captions } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';

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
    :title="t('lyricsResearch.queue.title')"
    :guidance="t('lyricsResearch.queue.guidance')"
  >
    <template #actions>
      <UiCheckbox
        :id="id"
        :label="t('lyricsResearch.queue.auto')"
        :aria-label="t('lyricsResearch.queue.autoLabel')"
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
      <UiHint v-if="queue.state.value && !queue.state.value.allowed">{{
        t('lyricsResearch.queue.enableProcessing')
      }}</UiHint>
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
      <UiHint v-if="!queue.state.value && !queue.error.value" role="status">{{
        t('lyricsResearch.queue.loading')
      }}</UiHint>
      <UiButton
        v-if="queue.readError.value"
        variant="ghost"
        @click="queue.refresh"
        >{{ t('lyricsResearch.settings.actions.refresh') }}</UiButton
      >
    </template>
  </SettingsDocumentItem>
</template>

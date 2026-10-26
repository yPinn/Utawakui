<script setup>
import { MessageSquare } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

const emit = defineEmits(['open']);
</script>

<template>
  <SettingsDocumentItem
    :icon="MessageSquare"
    title="回報與建議"
    guidance="回報使用、歌曲或歌詞來源問題，也可提出建議。"
  >
    <template #actions>
      <UiIconButton
        :icon="MessageSquare"
        label="開啟回報與建議"
        @click="emit('open')"
      />
    </template>
  </SettingsDocumentItem>
</template>

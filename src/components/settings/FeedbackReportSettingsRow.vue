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
    guidance="回報使用問題、提出建議，或反映歌曲與歌詞來源問題。"
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

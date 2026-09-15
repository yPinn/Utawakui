<script setup>
import { MessageSquare } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import SettingsActionRow from './SettingsActionRow.vue';

const emit = defineEmits(['open']);
</script>

<template>
  <SettingsActionRow
    :icon="MessageSquare"
    title="回報問題"
    tooltip="回報問題、提出功能請求、告訴我們使用上的想法，或反映內容／歌詞來源問題。"
  >
    <template #actions>
      <UiButton variant="ghost" @click="emit('open')">回報問題</UiButton>
    </template>
  </SettingsActionRow>
</template>

<script setup>
import { MessageSquare } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
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
      <UiIconButton
        :icon="MessageSquare"
        label="開啟問題回報"
        @click="emit('open')"
      />
    </template>
  </SettingsActionRow>
</template>

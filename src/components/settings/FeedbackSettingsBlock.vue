<script setup>
import { MessageSquare } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import SettingsActionRow from './SettingsActionRow.vue';
import SettingsBlock from './SettingsBlock.vue';

const emit = defineEmits(['open']);
</script>

<template>
  <SettingsBlock title="意見回饋" summary="錯誤、功能請求或使用心得都歡迎">
    <SettingsActionRow
      :icon="MessageSquare"
      title="回報問題"
      tooltip="回報問題、提出功能請求，或告訴我們使用上的想法。"
    >
      <template #actions>
        <UiButton variant="ghost" @click="emit('open')">回報問題</UiButton>
      </template>
    </SettingsActionRow>
  </SettingsBlock>
</template>

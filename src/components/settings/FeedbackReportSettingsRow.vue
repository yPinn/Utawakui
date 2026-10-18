<script setup>
import { MessageSquare } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

const emit = defineEmits(['open']);
</script>

<template>
  <SettingsDocumentItem
    :icon="MessageSquare"
    title="回報問題"
    guidance="提出建議或回報內容來源。"
  >
    <template #actions>
      <UiIconButton
        :icon="MessageSquare"
        label="開啟問題回報"
        @click="emit('open')"
      />
    </template>
  </SettingsDocumentItem>
</template>

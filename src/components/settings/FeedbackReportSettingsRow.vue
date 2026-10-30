<script setup>
import { MessageSquare } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

const emit = defineEmits(['open']);
</script>

<template>
  <SettingsDocumentItem
    :icon="MessageSquare"
    :title="t('settings.feedback.title')"
    :guidance="t('settings.feedback.guidance')"
  >
    <template #actions>
      <UiIconButton
        :icon="MessageSquare"
        :label="t('settings.feedback.open')"
        @click="emit('open')"
      />
    </template>
  </SettingsDocumentItem>
</template>

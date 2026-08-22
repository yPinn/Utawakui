<script setup>
import { Headphones } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsActionRow from './SettingsActionRow.vue';
import SettingsBlock from './SettingsBlock.vue';

defineProps({
  enabled: { type: Boolean, default: false },
  deviceLabel: { type: String, default: '未選擇' },
  errorNotice: { type: Object, default: null },
});

const emit = defineEmits(['selectDevice']);
</script>

<template>
  <SettingsBlock
    title="音訊輸出"
    summary="將伴奏送至 OBS 擷取裝置"
    :status="enabled ? '已啟用' : '未啟用'"
    :status-tone="enabled ? 'success' : 'muted'"
  >
    <SettingsActionRow
      :icon="Headphones"
      title="擷取輸出裝置"
      :value="deviceLabel"
      tooltip="選擇 OBS 用的虛擬音效裝置。"
    >
      <template #actions>
        <UiIconButton
          :icon="Headphones"
          label="選擇擷取輸出裝置"
          aria-haspopup="dialog"
          @click="emit('selectDevice')"
        />
      </template>
    </SettingsActionRow>

    <UiNotice
      v-if="errorNotice"
      :notice="errorNotice"
      compact
      @action="emit('selectDevice')"
    />
  </SettingsBlock>
</template>

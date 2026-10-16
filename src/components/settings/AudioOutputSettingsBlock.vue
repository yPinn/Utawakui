<script setup>
import { Headphones } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

defineProps({
  enabled: { type: Boolean, default: false },
  deviceLabel: { type: String, default: '未選擇' },
  errorNotice: { type: Object, default: null },
});

const emit = defineEmits(['selectDevice']);
</script>

<template>
  <div class="audio-output-settings-block">
    <SettingsDocumentItem
      :icon="Headphones"
      title="擷取輸出裝置"
      :value="deviceLabel"
      :status="enabled ? '已啟用' : '未啟用'"
      :status-tone="enabled ? 'success' : 'muted'"
      guidance="選擇直播或錄影軟體接收伴奏的虛擬裝置。"
    >
      <template #actions>
        <UiIconButton
          :icon="Headphones"
          label="選擇擷取輸出裝置"
          aria-haspopup="dialog"
          @click="emit('selectDevice')"
        />
      </template>
    </SettingsDocumentItem>

    <UiNotice
      v-if="errorNotice"
      :notice="errorNotice"
      compact
      @action="emit('selectDevice')"
    />
  </div>
</template>

<style scoped>
.audio-output-settings-block {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
}
</style>

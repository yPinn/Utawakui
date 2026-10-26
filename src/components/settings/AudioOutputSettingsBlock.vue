<script setup>
import { Headphones } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiRange from '../ui/UiRange.vue';
import { AUDIO_CONTROL_VALUES } from '../../utils/audioPreferences.js';

defineProps({
  enabled: { type: Boolean, default: false },
  deviceLabel: { type: String, default: '未選擇' },
  errorNotice: { type: Object, default: null },
  captureVolume: {
    type: Number,
    default: AUDIO_CONTROL_VALUES.captureVolume.defaultValue,
  },
});

const emit = defineEmits(['selectDevice', 'update:captureVolume']);
</script>

<template>
  <div class="audio-output-settings-block">
    <SettingsDocumentItem
      :icon="Headphones"
      title="擷取輸出裝置"
      :value="deviceLabel"
      :status="enabled ? '已啟用' : '未啟用'"
      :status-tone="enabled ? 'success' : 'muted'"
      guidance="供直播或錄影擷取；與本機聆聽分開設定。"
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

    <UiRange
      id="capture-master-volume"
      class="audio-output-settings-block__volume"
      label="直播擷取總音量"
      :model-value="captureVolume"
      :min="AUDIO_CONTROL_VALUES.captureVolume.min"
      :max="AUDIO_CONTROL_VALUES.captureVolume.max"
      :step="AUDIO_CONTROL_VALUES.captureVolume.step"
      :default-value="AUDIO_CONTROL_VALUES.captureVolume.defaultValue"
      :value-text="`${Math.round(captureVolume * 100)}%`"
      hint="套用演唱與 BGM；預設 50% 保留餘裕，不影響監聽或導唱比例。"
      @update:model-value="emit('update:captureVolume', $event)"
    />

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

.audio-output-settings-block__volume {
  margin-inline-start: var(--settings-copy-inset, 0);
  min-inline-size: min(
    100% - var(--settings-copy-inset, 0px),
    var(--settings-range-min-inline-size)
  );
  inline-size: min(
    100% - var(--settings-copy-inset, 0px),
    var(--settings-range-max-inline-size)
  );
  max-inline-size: var(--settings-range-max-inline-size);
  padding-block-end: var(--settings-row-padding-block, var(--ui-space-4));
}
</style>

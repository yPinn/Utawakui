<script setup>
import { Headphones } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiRange from '../ui/UiRange.vue';
import { AUDIO_CONTROL_VALUES } from '../../utils/audioPreferences.js';
import { t } from '../../utils/i18n.js';

defineProps({
  enabled: { type: Boolean, default: false },
  deviceLabel: { type: String, default: () => t('audio.notSelected') },
  errorNotice: { type: Object, default: null },
  captureVolume: {
    type: Number,
    default: AUDIO_CONTROL_VALUES.captureVolume.defaultValue,
  },
});

const emit = defineEmits(['selectDevice', 'update:captureVolume']);
const formatVolumePercent = (value) => `${Math.round(value * 100)}%`;
</script>

<template>
  <div class="audio-output-settings-block">
    <SettingsDocumentItem
      :icon="Headphones"
      :title="t('audio.capture.title')"
      :value="enabled ? deviceLabel : ''"
      :status="t(enabled ? 'audio.capture.enabled' : 'audio.capture.disabled')"
      :status-tone="enabled ? 'success' : 'muted'"
      :guidance="t('audio.capture.guidance')"
    >
      <template #actions>
        <UiButton
          variant="secondary"
          aria-haspopup="dialog"
          @click="emit('selectDevice')"
        >
          {{ t('audio.capture.select') }}
        </UiButton>
      </template>
    </SettingsDocumentItem>

    <div class="audio-output-settings-block__details">
      <UiRange
        id="capture-master-volume"
        class="audio-output-settings-block__volume"
        :label="t('audio.capture.volume')"
        :model-value="captureVolume"
        :min="AUDIO_CONTROL_VALUES.captureVolume.min"
        :max="AUDIO_CONTROL_VALUES.captureVolume.max"
        :step="AUDIO_CONTROL_VALUES.captureVolume.step"
        :default-value="AUDIO_CONTROL_VALUES.captureVolume.defaultValue"
        :value-text="formatVolumePercent(captureVolume)"
        value-in-label
        :format-value="formatVolumePercent"
        :hint="t('audio.capture.volumeHint')"
        @update:model-value="emit('update:captureVolume', $event)"
      />

      <UiNotice
        v-if="errorNotice"
        :notice="errorNotice"
        compact
        @action="emit('selectDevice')"
      />
    </div>
  </div>
</template>

<style scoped>
.audio-output-settings-block__details {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-inline-start: var(--settings-copy-inset, 0);
  padding-block-end: var(--settings-row-padding-block, var(--ui-space-4));
}

.audio-output-settings-block__volume {
  inline-size: 100%;
  max-inline-size: var(--settings-range-max-inline-size);
}
</style>

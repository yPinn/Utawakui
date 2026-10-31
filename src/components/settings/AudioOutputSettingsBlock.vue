<script setup>
import { Headphones } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
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
</script>

<template>
  <div class="audio-output-settings-block">
    <SettingsDocumentItem
      :icon="Headphones"
      :title="t('audio.capture.title')"
      :value="deviceLabel"
      :status="t(enabled ? 'audio.capture.enabled' : 'audio.capture.disabled')"
      :status-tone="enabled ? 'success' : 'muted'"
      :guidance="t('audio.capture.guidance')"
    >
      <template #actions>
        <UiIconButton
          :icon="Headphones"
          :label="t('audio.capture.select')"
          aria-haspopup="dialog"
          @click="emit('selectDevice')"
        />
      </template>
    </SettingsDocumentItem>

    <UiRange
      id="capture-master-volume"
      class="audio-output-settings-block__volume"
      :label="t('audio.capture.volume')"
      :model-value="captureVolume"
      :min="AUDIO_CONTROL_VALUES.captureVolume.min"
      :max="AUDIO_CONTROL_VALUES.captureVolume.max"
      :step="AUDIO_CONTROL_VALUES.captureVolume.step"
      :default-value="AUDIO_CONTROL_VALUES.captureVolume.defaultValue"
      :value-text="`${Math.round(captureVolume * 100)}%`"
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

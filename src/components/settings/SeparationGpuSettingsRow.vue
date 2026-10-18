<script setup>
import { Cpu } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

defineProps({
  gpuAcceleration: { type: Boolean, default: true },
  preferenceBusy: { type: Boolean, default: false },
  preferenceError: { type: String, default: '' },
  readError: { type: String, default: '' },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
});

const emit = defineEmits(['setGpuAcceleration', 'refreshPreference']);
</script>

<template>
  <div class="separation-gpu-settings-row">
    <SettingsDocumentItem
      :icon="Cpu"
      title="人聲分離"
      guidance="GPU 無法使用時改用 CPU。"
      variant="nested"
    >
      <template #actions>
        <UiCheckbox
          id="separation-gpu-acceleration"
          label="GPU 加速"
          aria-label="使用 GPU 加速人聲分離"
          :model-value="loaded ? gpuAcceleration : false"
          :disabled="preferenceBusy || reading || !loaded"
          :error="preferenceError"
          @update:model-value="emit('setGpuAcceleration', $event)"
        />
      </template>
      <template v-if="readError || !loaded" #feedback>
        <UiHint :tone="readError ? 'danger' : 'muted'" role="status">{{
          readError || '讀取中；尚未確認已儲存設定。'
        }}</UiHint>
        <UiButton
          v-if="readError"
          variant="ghost"
          :loading="reading"
          @click="emit('refreshPreference')"
          >重新讀取</UiButton
        >
      </template>
    </SettingsDocumentItem>
  </div>
</template>

<style scoped>
.separation-gpu-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}
</style>

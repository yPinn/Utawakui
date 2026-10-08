<script setup>
import { Cpu } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsActionRow from './SettingsActionRow.vue';

defineProps({
  gpuAcceleration: { type: Boolean, default: true },
  preferenceBusy: { type: Boolean, default: false },
  preferenceError: { type: String, default: '' },
});

const emit = defineEmits(['setGpuAcceleration']);
</script>

<template>
  <div class="separation-gpu-settings-row">
    <SettingsActionRow
      :icon="Cpu"
      title="人聲分離"
      tooltip="無法使用 GPU 時，會自動改用 CPU。"
      variant="subtle"
    >
      <template #actions>
        <UiCheckbox
          id="separation-gpu-acceleration"
          label="GPU 加速"
          aria-label="使用 GPU 加速人聲分離"
          :model-value="gpuAcceleration"
          :disabled="preferenceBusy"
          @update:model-value="emit('setGpuAcceleration', $event)"
        />
      </template>
    </SettingsActionRow>

    <UiNotice
      v-if="preferenceError"
      tone="danger"
      title="GPU 加速設定未儲存"
      :message="preferenceError"
      compact
    />
  </div>
</template>

<style scoped>
.separation-gpu-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}
</style>

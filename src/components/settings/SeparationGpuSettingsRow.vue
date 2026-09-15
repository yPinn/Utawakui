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
      value="嘗試以 GPU 加速 quick／general 分離"
      tooltip="偵測不到相容 GPU 或加速失敗時，自動退回 CPU。"
      variant="subtle"
    >
      <template #actions>
        <UiCheckbox
          id="separation-gpu-acceleration"
          label="GPU 加速（建議）"
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

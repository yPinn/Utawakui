<script setup>
import { computed, shallowRef } from 'vue';
import { useAudioOutput } from '../../composables/useAudioOutput.js';
import { usePlayer } from '../../composables/usePlayer.js';
import AppFolderSection from '../layout/AppFolderSection.vue';
import AudioOutputSettingsBlock from './AudioOutputSettingsBlock.vue';
import CaptureDeviceModal from './CaptureDeviceModal.vue';

const { state: playerState } = usePlayer();
const { devices: captureOutputDevices, captureErrorNotice } = useAudioOutput();
const isCaptureDeviceModalOpen = shallowRef(false);

const captureDeviceLabel = computed(() => {
  if (!playerState.captureDeviceId) return '未選擇';
  const device = captureOutputDevices.value.find(
    (entry) => entry.deviceId === playerState.captureDeviceId,
  );
  return device?.label || '裝置名稱無法讀取';
});
</script>

<template>
  <AppFolderSection
    id="settings-audio"
    class="settings-audio-section"
    title="音訊輸出"
    tabindex="-1"
  >
    <AudioOutputSettingsBlock
      :enabled="Boolean(playerState.captureDeviceId)"
      :device-label="captureDeviceLabel"
      :error-notice="captureErrorNotice"
      @select-device="isCaptureDeviceModalOpen = true"
    />

    <CaptureDeviceModal
      :open="isCaptureDeviceModalOpen"
      @close="isCaptureDeviceModalOpen = false"
    />
  </AppFolderSection>
</template>

<style scoped>
.settings-audio-section {
  min-inline-size: 0;
  scroll-margin-block-start: var(--ui-space-4);
}

.settings-audio-section:focus {
  outline: none;
}
</style>

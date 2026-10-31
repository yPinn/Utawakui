<script setup>
import { computed, shallowRef } from 'vue';
import { useAudioOutput } from '../../composables/useAudioOutput.js';
import { usePlayer } from '../../composables/usePlayer.js';
import SettingsSection from './SettingsSection.vue';
import AudioOutputSettingsBlock from './AudioOutputSettingsBlock.vue';
import CaptureDeviceModal from './CaptureDeviceModal.vue';
import { t } from '../../utils/i18n.js';

const { state: playerState, setCaptureVolume } = usePlayer();
const { devices: captureOutputDevices, captureErrorNotice } = useAudioOutput();
const isCaptureDeviceModalOpen = shallowRef(false);

const captureDeviceLabel = computed(() => {
  if (!playerState.captureDeviceId) return t('audio.notSelected');
  const device = captureOutputDevices.value.find(
    (entry) => entry.deviceId === playerState.captureDeviceId,
  );
  return device?.label || t('audio.deviceNameUnreadable');
});
</script>

<template>
  <SettingsSection
    id="settings-audio"
    class="settings-audio-section"
    :title="t('audio.section')"
    tabindex="-1"
  >
    <AudioOutputSettingsBlock
      :enabled="Boolean(playerState.captureDeviceId)"
      :device-label="captureDeviceLabel"
      :error-notice="captureErrorNotice"
      :capture-volume="playerState.captureVolume"
      @update:capture-volume="setCaptureVolume"
      @select-device="isCaptureDeviceModalOpen = true"
    />

    <CaptureDeviceModal
      :open="isCaptureDeviceModalOpen"
      @close="isCaptureDeviceModalOpen = false"
    />
  </SettingsSection>
</template>

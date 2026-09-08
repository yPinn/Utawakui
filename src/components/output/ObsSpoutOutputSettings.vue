<script setup>
import { computed } from 'vue';
import { MonitorUp, Play, Power } from '../../icons/index.js';
import { describeSpoutOutputStatus } from '../../utils/spoutOutputStatus.js';
import SettingsActionRow from '../settings/SettingsActionRow.vue';
import SettingsBlock from '../settings/SettingsBlock.vue';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
  status: { type: Object, default: () => ({}) },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['set-frame-rate-profile', 'start', 'stop']);
const presentation = computed(() => describeSpoutOutputStatus(props.status));
const frameRateProfile = computed(
  () => props.status.desired?.frameRateProfile ?? 'standard',
);
const surface = computed(
  () =>
    props.status.desired?.surface ?? {
      senderName: 'Utawakui.Lyrics',
      width: 1920,
      height: 1080,
    },
);
const isSending = computed(
  () => props.status.observed?.lifecycle === 'sending',
);
const isActive = computed(() =>
  ['starting', 'sending', 'stopping'].includes(
    props.status.observed?.lifecycle,
  ),
);
const surfaceDescription = computed(
  () =>
    `${surface.value.width} × ${surface.value.height} · Premultiplied Alpha`,
);
const senderValue = computed(() =>
  props.status.supported === false
    ? presentation.value.detail
    : surface.value.senderName,
);
const noticeMessage = computed(
  () =>
    props.error ||
    (presentation.value.state === 'error' ? presentation.value.detail : ''),
);
</script>

<template>
  <SettingsBlock
    title="Spout2 輸出"
    summary="發布透明歌詞供相容接收端擷取。"
    :status="presentation.label"
    :status-tone="presentation.tone"
  >
    <SettingsActionRow
      :icon="MonitorUp"
      title="Sender"
      :description="surfaceDescription"
      :value="senderValue"
      status="實驗性"
      status-tone="warning"
    >
      <template #actions>
        <UiButton
          v-if="!isSending"
          :icon="Play"
          variant="accent"
          :disabled="busy || status.supported === false"
          @click="emit('start')"
        >
          啟動輸出
        </UiButton>
        <UiButton v-else :icon="Power" :disabled="busy" @click="emit('stop')">
          停止輸出
        </UiButton>
      </template>
    </SettingsActionRow>

    <SettingsActionRow title="幀率" variant="subtle">
      <template #actions>
        <UiButton
          :active="frameRateProfile === 'reduced'"
          :aria-pressed="frameRateProfile === 'reduced'"
          :disabled="busy || isActive || status.supported === false"
          @click="emit('set-frame-rate-profile', 'reduced')"
        >
          30 FPS
        </UiButton>
        <UiButton
          :active="frameRateProfile === 'standard'"
          :aria-pressed="frameRateProfile === 'standard'"
          :disabled="busy || isActive || status.supported === false"
          @click="emit('set-frame-rate-profile', 'standard')"
        >
          60 FPS
        </UiButton>
      </template>
    </SettingsActionRow>

    <UiNotice
      v-if="noticeMessage"
      tone="danger"
      title="Spout2 操作未完成"
      :message="noticeMessage"
      compact
    />
  </SettingsBlock>
</template>

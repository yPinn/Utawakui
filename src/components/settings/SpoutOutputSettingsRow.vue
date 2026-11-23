<script setup>
import { computed, onMounted } from 'vue';
import { Play, Power } from '../../icons/index.js';
import { useSpoutOutput } from '../../composables/output/useSpoutOutput.js';
import { describeSpoutOutputStatus } from '../../utils/spoutOutputStatus.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

const FRAME_RATE_ITEMS = Object.freeze([
  { id: 'reduced', label: '30 FPS' },
  { id: 'standard', label: '60 FPS' },
]);

const spout = useSpoutOutput();
const spoutState = spout.state;
const spoutBusy = computed(
  () =>
    spoutState.isConfiguring || spoutState.isStarting || spoutState.isStopping,
);

const spoutPresentation = computed(() =>
  describeSpoutOutputStatus(spoutState.status),
);
const spoutSupported = computed(() => spoutState.status.supported !== false);
const spoutSurface = computed(
  () =>
    spoutState.status.desired?.surface ?? {
      senderName: 'Utawakui.Lyrics',
      width: 1920,
      height: 1080,
    },
);
const spoutValue = computed(() =>
  spoutSupported.value
    ? t('output.spout.surface', {
        name: spoutSurface.value.senderName,
        width: spoutSurface.value.width,
        height: spoutSurface.value.height,
      })
    : spoutPresentation.value.detail,
);
const spoutSending = computed(
  () => spoutState.status.observed?.lifecycle === 'sending',
);
const spoutActive = computed(() =>
  ['starting', 'sending', 'stopping'].includes(
    spoutState.status.observed?.lifecycle,
  ),
);
const spoutFrameRate = computed(
  () => spoutState.status.desired?.frameRateProfile ?? 'standard',
);
const spoutReadError = computed(() => spoutState.errors?.refresh || '');
const spoutConfigurationError = computed(
  () => spoutState.errors?.['set-frame-rate-profile'] || '',
);
const spoutOperationError = computed(
  () => spoutState.errors?.start || spoutState.errors?.stop || '',
);
const spoutHasIssue = computed(() =>
  Boolean(
    spoutConfigurationError.value ||
    spoutReadError.value ||
    spoutOperationError.value ||
    spoutPresentation.value.state === 'error',
  ),
);
onMounted(spout.refresh);
</script>

<template>
  <SettingsDocumentItem
    :title="t('output.spout.title')"
    :value="spoutReadError ? t('output.spout.unconfirmed') : spoutValue"
    :status="spoutReadError ? t('output.unreadable') : spoutPresentation.label"
    :status-tone="spoutReadError ? 'warning' : spoutPresentation.tone"
    :guidance="t('output.spout.guidance')"
    variant="nested"
    title-tag="h3"
  >
    <template #actions>
      <UiSegmentedControl
        :items="FRAME_RATE_ITEMS"
        :model-value="spoutFrameRate"
        :aria-label="t('output.spout.fps')"
        wrap
        :disabled="
          spoutBusy || spoutActive || !spoutSupported || Boolean(spoutReadError)
        "
        @update:model-value="spout.setFrameRateProfile($event)"
      />
      <UiButton
        v-if="!spoutSending"
        :icon="Play"
        variant="accent"
        :disabled="spoutBusy || !spoutSupported || Boolean(spoutReadError)"
        @click="spout.start()"
      >
        {{ t('output.start') }}
      </UiButton>
      <UiButton
        v-else
        :icon="Power"
        variant="secondary"
        :disabled="spoutBusy"
        @click="spout.stop()"
      >
        {{ t('output.stop') }}
      </UiButton>
    </template>
    <template v-if="spoutHasIssue" #feedback>
      <UiHint v-if="spoutConfigurationError" tone="danger" role="alert">{{
        spoutConfigurationError
      }}</UiHint>
      <UiHint v-if="spoutReadError" tone="danger" role="alert">{{
        spoutReadError
      }}</UiHint>
      <UiButton
        v-if="spoutReadError"
        variant="ghost"
        :loading="spoutState.isRefreshing"
        @click="spout.refresh()"
        >{{ t('output.spout.reload') }}</UiButton
      >
      <UiHint
        v-if="spoutOperationError && spoutPresentation.state !== 'error'"
        tone="danger"
        role="alert"
        >{{ spoutOperationError }}</UiHint
      >
      <UiHint
        v-if="spoutPresentation.state === 'error'"
        tone="warning"
        role="alert"
        >{{ spoutPresentation.detail }}</UiHint
      >
    </template>
  </SettingsDocumentItem>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch, shallowRef } from 'vue';
import { useMicrophoneResearch } from '../../composables/useMicrophoneResearch.js';
import { MICROPHONE_LOW_CUT_OPTIONS_HZ } from '../../microphone/inputProcessing.js';
import {
  microphonePitchStatus,
  microphonePitchTone,
} from '../../microphone/pitchInputStatus.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiRange from '../ui/UiRange.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import MicrophoneInputMeter from './MicrophoneInputMeter.vue';

const emit = defineEmits(['frame']);
const preferences = defineModel('preferences', {
  type: Object,
  required: true,
});
const props = defineProps({
  access: { type: Object, default: undefined },
  stopWhenHidden: { type: Boolean, default: false },
  preferSystemDefault: { type: Boolean, default: false },
  meterHost: { type: Object, default: null },
});
const {
  state,
  refreshDevices,
  selectDevice,
  switchDevice,
  start,
  stop,
  configureInput,
  setNoiseSuppression,
} = useMicrophoneResearch({
  access: props.access,
  stopWhenHidden: props.stopWhenHidden,
  preferSystemDefault: props.preferSystemDefault,
  followDeviceChanges: true,
});
const running = computed(() => state.value.status === 'running');
const active = computed(
  () => running.value || state.value.status === 'requesting',
);
const lowCutOptions = MICROPHONE_LOW_CUT_OPTIONS_HZ.map((value) => ({
  value,
  label: t(`performerInput.lowCutPresets.hz${value}.label`, { hz: value }),
}));
const lowCutHint = computed(() =>
  t(
    `performerInput.lowCutPresets.hz${state.value.inputOptions.highPassHz}.hint`,
  ),
);
const noiseHint = computed(() => {
  const { processingSupport, settings, inputOptions } = state.value;
  if (!processingSupport.noiseSuppression)
    return t('performerInput.noiseUnsupported');
  if (running.value) {
    const actual = settings?.noiseSuppression;
    if (actual == null) return t('performerInput.noiseUnknown');
    if (actual !== inputOptions.noiseSuppression)
      return t('performerInput.noiseMismatch');
  }
  return t('performerInput.noiseHint');
});
const formatGain = (db) => `${db > 0 ? '+' : ''}${db} dB`;
const tuningOpen = shallowRef(false);
const latestFrame = computed(() => state.value.pitchHistory.at(-1));
const meterStatus = computed(() =>
  running.value
    ? microphonePitchStatus(latestFrame.value, state.value)
    : state.value.status,
);
const METER_REFRESH_MS = 200;
const meterReading = shallowRef(null);
let meterTimer;
function publishMeter() {
  meterReading.value =
    running.value && latestFrame.value
      ? {
          status: meterStatus.value,
          dbfs: state.value.dbfs,
          peak: state.value.peak,
          rawPeak: state.value.rawPeak,
        }
      : null;
}

watch([meterStatus, latestFrame], ([status, frame]) => {
  // Keep the history frame-accurate. Only the settings meter is rate-limited.
  const newClippingWarning =
    microphonePitchTone(status) === 'danger' &&
    status !== meterReading.value?.status;
  if (!running.value || !frame || newClippingWarning) {
    clearTimeout(meterTimer);
    meterTimer = undefined;
    publishMeter();
  } else if (meterTimer === undefined) {
    meterTimer = setTimeout(() => {
      meterTimer = undefined;
      publishMeter();
    }, METER_REFRESH_MS);
  }
});
onBeforeUnmount(() => clearTimeout(meterTimer));
const options = computed(() =>
  state.value.devices.map(({ id, label }) => ({
    value: id,
    label: id === 'default' ? t('performerInput.defaultDevice') : label,
  })),
);
const deviceName = computed(
  () =>
    state.value.inputLabel ||
    options.value.find(({ value }) => value === state.value.selectedDeviceId)
      ?.label ||
    t('performerInput.device'),
);
const showRefresh = computed(
  () => !options.value.length || Boolean(state.value.error),
);
const placeholder = computed(() => {
  if (state.value.refreshing) return t('performerInput.readingDevices');
  return t(
    options.value.length
      ? 'performerInput.chooseDevice'
      : 'performerInput.noDevice',
  );
});

function remember(changes) {
  preferences.value = { ...preferences.value, ...changes };
}
function toggleInput() {
  const enabled = !active.value;
  remember({ enabled });
  return enabled ? start() : stop();
}
function changeDevice(id) {
  const switching = switchDevice(id);
  if (state.value.selectedDeviceId === id) remember({ deviceId: id });
  return switching;
}
function changeInput(changes) {
  if (configureInput(changes)) remember(changes);
}
function changeNoise(enabled) {
  const applying = setNoiseSuppression(enabled);
  if (state.value.inputOptions.noiseSuppression === enabled)
    remember({ noiseSuppression: enabled });
  return applying;
}

onMounted(async () => {
  const { gainDb, highPassHz, noiseSuppression, deviceId } = preferences.value;
  configureInput({
    gainDb,
    highPassHz,
    noiseSuppression:
      noiseSuppression && state.value.processingSupport.noiseSuppression,
  });
  if (!(await refreshDevices())) return;
  if (deviceId && !selectDevice(deviceId)) return;
  if (preferences.value.enabled && !document.hidden) await start();
});

watch(
  [running, latestFrame],
  ([isRunning, frame]) => {
    emit(
      'frame',
      isRunning,
      isRunning && frame
        ? { ...frame, levelTone: microphonePitchTone(meterStatus.value) }
        : undefined,
    );
  },
  { flush: 'sync' },
);
</script>

<template>
  <div class="reference-mic">
    <UiSelect
      id="reference-pitch-mic"
      :label="t('performerInput.device')"
      :placeholder="placeholder"
      :model-value="state.selectedDeviceId"
      :options="options"
      :disabled="
        state.status === 'requesting' || state.refreshing || !options.length
      "
      label-inline
      @update:model-value="changeDevice"
    />
    <div class="reference-mic__actions">
      <UiButton
        v-if="showRefresh"
        variant="secondary"
        :disabled="active || state.refreshing"
        @click="refreshDevices()"
      >
        {{
          t(
            state.refreshing
              ? 'performerInput.readingDevices'
              : 'performerInput.readDevices',
          )
        }}
      </UiButton>
      <UiButton
        class="reference-mic__primary"
        variant="accent"
        :disabled="!active && (!state.selectedDeviceId || state.refreshing)"
        @click="toggleInput"
      >
        {{ t(active ? 'performerInput.stop' : 'performerInput.start') }}
      </UiButton>
    </div>
    <Teleport v-if="meterHost" :to="meterHost">
      <MicrophoneInputMeter
        :device-name="deviceName"
        :status="meterReading?.status ?? (running ? 'waiting' : state.status)"
        :dbfs="meterReading?.dbfs"
        :peak="meterReading?.peak"
        :raw-peak="meterReading?.rawPeak"
      />
    </Teleport>
    <UiHint v-if="state.error" tone="warning" role="alert">
      {{ state.error }}
    </UiHint>
    <UiDisclosure v-model:open="tuningOpen" :label="t('performerInput.adjust')">
      <div class="reference-mic__tuning">
        <UiSwitch
          id="sing-along-mic-noise"
          :label="t('performerInput.noiseSuppression')"
          :hint="noiseHint"
          :model-value="state.inputOptions.noiseSuppression"
          :disabled="
            state.status === 'requesting' ||
            !state.processingSupport.noiseSuppression
          "
          @update:model-value="changeNoise"
        />
        <UiSelect
          id="sing-along-mic-low-cut"
          :label="t('performerInput.lowCut')"
          :hint="lowCutHint"
          :options="lowCutOptions"
          :model-value="state.inputOptions.highPassHz"
          :disabled="state.status === 'requesting'"
          @update:model-value="changeInput({ highPassHz: $event })"
        />
        <UiRange
          id="sing-along-mic-gain"
          :label="t('performerInput.gain')"
          :hint="t('performerInput.gainHint')"
          :model-value="state.inputOptions.gainDb"
          :min="-24"
          :max="24"
          :step="1"
          :value-text="formatGain(state.inputOptions.gainDb)"
          :format-value="formatGain"
          value-in-label
          :disabled="state.status === 'requesting'"
          @update:model-value="changeInput({ gainDb: $event })"
        />
        <slot name="tuning" />
      </div>
    </UiDisclosure>
  </div>
</template>

<style scoped>
.reference-mic,
.reference-mic__tuning {
  display: grid;
  gap: var(--ui-space-2);
}

.reference-mic__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.reference-mic__primary {
  flex: 1;
}
</style>

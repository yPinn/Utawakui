<script setup>
import { computed, onMounted, shallowRef, watch } from 'vue';
import { Cable, MonitorUp, Play, Power } from '../../icons/index.js';
import OUTPUT_RUNTIME_VALUES from '../../../shared/outputRuntimeValues.json';
import { useOutputRuntimeContext } from '../../composables/useOutputRuntimeContext.js';
import { useSpoutOutput } from '../../composables/output/useSpoutOutput.js';
import { describeOutputRuntimeStatus } from '../../utils/outputRuntimeStatus.js';
import { describeSpoutOutputStatus } from '../../utils/spoutOutputStatus.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTextField from '../ui/UiTextField.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

const FRAME_RATE_ITEMS = Object.freeze([
  { id: 'reduced', label: '30 FPS' },
  { id: 'standard', label: '60 FPS' },
]);

const output = useOutputRuntimeContext();
const spout = useSpoutOutput();
const outputState = output.state;
const spoutState = spout.state;

const draftPort = shallowRef(String(outputState.settings.port));
const draftDisplayDelayMs = shallowRef(
  String(
    outputState.settings.displayDelayMs ??
      OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
  ),
);

watch(
  () => outputState.settings.port,
  (port) => {
    draftPort.value = String(port);
  },
);
watch(
  () =>
    outputState.settings.displayDelayMs ??
    OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
  (delay) => {
    draftDisplayDelayMs.value = String(delay);
  },
);

const busy = computed(
  () =>
    outputState.isStarting ||
    outputState.isStopping ||
    outputState.isLoadingSettings ||
    outputState.isSavingSettings,
);
const spoutBusy = computed(
  () =>
    spoutState.isConfiguring || spoutState.isStarting || spoutState.isStopping,
);

function isIntegerInRange(value, min, max) {
  if (!/^-?\d+$/.test(String(value).trim())) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max;
}

const isPortValid = computed(() =>
  isIntegerInRange(
    draftPort.value,
    OUTPUT_RUNTIME_VALUES.minPort,
    OUTPUT_RUNTIME_VALUES.maxPort,
  ),
);
const isDisplayDelayValid = computed(() =>
  isIntegerInRange(
    draftDisplayDelayMs.value,
    OUTPUT_RUNTIME_VALUES.minDisplayDelayMs,
    OUTPUT_RUNTIME_VALUES.maxDisplayDelayMs,
  ),
);

const settingsError = computed(
  () => outputState.errors?.['save-settings'] || '',
);
const settingsReadError = computed(
  () => outputState.errors?.['load-settings'] || '',
);
const outputReadError = computed(() => outputState.errors?.status || '');
const serviceError = computed(
  () => outputState.errors?.start || outputState.errors?.stop || '',
);
const hasPortConflict = computed(() => outputState.suggestedPorts.length > 0);
const isSettingsOpen = shallowRef(false);
watch(
  () =>
    hasPortConflict.value ||
    Boolean(settingsError.value || settingsReadError.value),
  (needsAttention) => {
    if (needsAttention) isSettingsOpen.value = true;
  },
  { immediate: true },
);
const runtimeStatus = computed(() =>
  describeOutputRuntimeStatus(outputState.status),
);
const runtimeFault = computed(
  () =>
    outputState.errors?.runtime ||
    (outputState.status.error ? t('output.fault') : ''),
);
const serviceStatus = computed(() => {
  if (outputReadError.value)
    return {
      label: t('output.unreadable'),
      tone: 'warning',
      detail: t('output.unconfirmed'),
    };
  if (runtimeFault.value)
    return {
      label: t('output.serviceFault'),
      tone: 'danger',
      detail: runtimeFault.value,
    };
  return runtimeStatus.value;
});

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

function commitSettings(overrides) {
  if (busy.value || settingsReadError.value) return;
  if (!overrides && (!isPortValid.value || !isDisplayDelayValid.value)) return;
  const current = outputState.settings;
  const currentDelay =
    current.displayDelayMs ?? OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs;
  const next = overrides
    ? {
        autoStart: current.autoStart,
        port: current.port,
        displayDelayMs: currentDelay,
        ...overrides,
      }
    : {
        autoStart: current.autoStart,
        port: Number(draftPort.value),
        displayDelayMs: Number(draftDisplayDelayMs.value),
      };
  if (
    next.autoStart === current.autoStart &&
    next.port === current.port &&
    next.displayDelayMs === currentDelay
  ) {
    return;
  }
  output.updateSettings(next);
}

function chooseSuggestedPort(port) {
  draftPort.value = String(port);
}

onMounted(() => {
  output.refreshStatus?.();
  spout.refresh();
});
</script>

<template>
  <div class="output-runtime-settings-block">
    <div class="output-runtime-settings-block__service">
      <SettingsDocumentItem
        :icon="Cable"
        :title="t('output.title')"
        :value="serviceStatus.detail"
        :status="serviceStatus.label"
        :status-tone="serviceStatus.tone"
        :guidance="t('output.guidance')"
        variant="nested"
      >
        <template #actions>
          <UiCheckbox
            id="output-runtime-auto-start"
            :label="t('output.autoStart')"
            :aria-label="t('output.autoStartLabel')"
            :model-value="outputState.settings.autoStart"
            :disabled="busy || Boolean(settingsReadError)"
            @update:model-value="commitSettings({ autoStart: $event })"
          />
          <UiButton
            v-if="!outputState.status.running"
            :icon="Play"
            variant="accent"
            :disabled="busy || Boolean(settingsReadError)"
            @click="output.start()"
          >
            {{ t('output.start') }}
          </UiButton>
          <UiButton
            v-else
            :icon="Power"
            variant="secondary"
            :disabled="busy || Boolean(settingsReadError)"
            @click="output.stop()"
          >
            {{ t('output.stop') }}
          </UiButton>
        </template>
        <template
          v-if="
            outputReadError ||
            (serviceError && !hasPortConflict && !runtimeFault)
          "
          #feedback
        >
          <UiHint v-if="outputReadError" tone="danger" role="alert">{{
            outputReadError
          }}</UiHint>
          <UiButton
            v-if="outputReadError"
            variant="ghost"
            @click="output.refreshStatus()"
            >{{ t('output.reloadStatus') }}</UiButton
          >
          <UiHint
            v-if="serviceError && !hasPortConflict && !runtimeFault"
            tone="danger"
            role="alert"
            >{{ serviceError }}</UiHint
          >
        </template>
      </SettingsDocumentItem>

      <UiDisclosure
        v-model:open="isSettingsOpen"
        class="settings-section__disclosure"
        :label="t('output.portSettings')"
      >
        <div class="output-runtime-settings-block__form">
          <UiHint v-if="settingsReadError" tone="danger" role="alert">{{
            settingsReadError
          }}</UiHint>
          <UiButton
            v-if="settingsReadError"
            variant="ghost"
            :loading="outputState.isLoadingSettings"
            @click="output.refreshSettings()"
            >{{ t('output.reloadSettings') }}</UiButton
          >

          <div class="output-runtime-settings-block__fields">
            <UiTextField
              id="output-runtime-port"
              v-model="draftPort"
              class="output-runtime-settings-block__number"
              :label="t('output.port')"
              inputmode="numeric"
              :error="
                !isPortValid
                  ? t('output.portInvalid', {
                      min: OUTPUT_RUNTIME_VALUES.minPort,
                      max: OUTPUT_RUNTIME_VALUES.maxPort,
                    })
                  : hasPortConflict
                    ? t('output.portInUse')
                    : ''
              "
              :disabled="busy || Boolean(settingsReadError)"
            />
            <UiTextField
              id="output-display-delay"
              v-model="draftDisplayDelayMs"
              class="output-runtime-settings-block__delay"
              :label="t('output.delay')"
              :hint="t('output.delayHint')"
              inputmode="numeric"
              :error="
                !isDisplayDelayValid
                  ? t('output.delayInvalid', {
                      min: OUTPUT_RUNTIME_VALUES.minDisplayDelayMs,
                      max: OUTPUT_RUNTIME_VALUES.maxDisplayDelayMs,
                    })
                  : ''
              "
              :disabled="busy || Boolean(settingsReadError)"
            />
          </div>

          <UiHint>{{ t('output.applyHint') }}</UiHint>

          <UiHint
            v-if="settingsError && !hasPortConflict"
            tone="danger"
            role="alert"
            >{{ settingsError }}</UiHint
          >
          <div
            v-if="hasPortConflict"
            class="output-runtime-settings-block__suggestions"
            role="group"
            :aria-label="t('output.availablePorts')"
          >
            <span>{{ t('output.availablePorts') }}</span>
            <UiButton
              v-for="port in outputState.suggestedPorts"
              :key="port"
              :active="Number(draftPort) === port"
              :disabled="busy || Boolean(settingsReadError)"
              @click="chooseSuggestedPort(port)"
            >
              {{ port }}
            </UiButton>
          </div>
          <div class="output-runtime-settings-block__submit">
            <UiButton
              variant="accent"
              :disabled="
                busy ||
                Boolean(settingsReadError) ||
                !isPortValid ||
                !isDisplayDelayValid
              "
              @click="commitSettings()"
              >{{ t('output.save') }}</UiButton
            >
          </div>
        </div>
      </UiDisclosure>
    </div>

    <SettingsDocumentItem
      :icon="MonitorUp"
      :title="t('output.spout.title')"
      :value="spoutReadError ? t('output.spout.unconfirmed') : spoutValue"
      :status="
        spoutReadError ? t('output.unreadable') : spoutPresentation.label
      "
      :status-tone="spoutReadError ? 'warning' : spoutPresentation.tone"
      :guidance="t('output.spout.guidance')"
      variant="nested"
    >
      <template #actions>
        <UiSegmentedControl
          :items="FRAME_RATE_ITEMS"
          :model-value="spoutFrameRate"
          :aria-label="t('output.spout.fps')"
          :disabled="
            spoutBusy ||
            spoutActive ||
            !spoutSupported ||
            Boolean(spoutReadError)
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
      <template
        v-if="
          spoutConfigurationError ||
          spoutReadError ||
          spoutOperationError ||
          spoutPresentation.state === 'error'
        "
        #feedback
      >
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
  </div>
</template>

<style scoped>
.output-runtime-settings-block {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.output-runtime-settings-block__service {
  display: grid;
}

.output-runtime-settings-block__form {
  display: grid;
  gap: var(--ui-space-3);
  padding-inline-start: var(--settings-copy-inset, 0);
}

.output-runtime-settings-block__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: var(--ui-space-3);
}
.output-runtime-settings-block__submit {
  display: flex;
  justify-content: flex-end;
}

/* Five port digits; the delay field keeps room for its hint. */
.output-runtime-settings-block__number {
  flex: 0 0 var(--settings-port-inline-size);
  max-inline-size: 100%;
}

.output-runtime-settings-block__delay {
  flex: 0 1 var(--settings-text-inline-size);
  min-inline-size: min(100%, 16ch);
  max-inline-size: 100%;
}
.output-runtime-settings-block__delay :deep(.ui-text-field__control-row) {
  max-inline-size: var(--settings-number-inline-size);
}

.output-runtime-settings-block__suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
</style>

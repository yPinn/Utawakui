<script setup>
import { computed, onMounted, shallowRef, watch } from 'vue';
import { Play, Power } from '../../icons/index.js';
import OUTPUT_RUNTIME_VALUES from '../../../shared/outputRuntimeValues.json';
import { useOutputRuntimeContext } from '../../composables/useOutputRuntimeContext.js';
import { describeOutputRuntimeStatus } from '../../utils/outputRuntimeStatus.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiTextField from '../ui/UiTextField.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

const output = useOutputRuntimeContext();
const outputState = output.state;

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
const browserSetupGuidance = computed(() => {
  if (serviceStatus.value.state === 'stopped') return t('output.guidance');
  if (serviceStatus.value.state === 'source-ready')
    return serviceStatus.value.detail;
  return '';
});

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
});
</script>

<template>
  <div class="output-runtime-settings-block">
    <div class="output-runtime-settings-block__service">
      <SettingsDocumentItem
        :title="t('output.title')"
        :value="browserSetupGuidance ? '' : serviceStatus.detail"
        :status="serviceStatus.label"
        :status-tone="serviceStatus.tone"
        :guidance="browserSetupGuidance"
        variant="nested"
      >
        <template #actions>
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
        <div class="settings-section__form">
          <UiCheckbox
            id="output-runtime-auto-start"
            class="output-runtime-settings-block__auto-start"
            :label="t('output.autoStartLabel')"
            :model-value="outputState.settings.autoStart"
            :disabled="busy || Boolean(settingsReadError)"
            @update:model-value="commitSettings({ autoStart: $event })"
          />
          <UiHint v-if="settingsReadError" tone="danger" role="alert">{{
            settingsReadError
          }}</UiHint>
          <UiButton
            v-if="settingsReadError"
            class="settings-section__form-action"
            variant="ghost"
            :loading="outputState.isLoadingSettings"
            @click="output.refreshSettings()"
            >{{ t('output.reloadSettings') }}</UiButton
          >

          <div class="output-runtime-settings-block__fields">
            <UiTextField
              id="output-runtime-port"
              v-model="draftPort"
              class="settings-section__port-field"
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
          <UiButton
            class="settings-section__form-action"
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
      </UiDisclosure>
    </div>
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

.output-runtime-settings-block__auto-start {
  justify-self: start;
  max-inline-size: 100%;
}

.output-runtime-settings-block__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: var(--ui-space-2);
}

.output-runtime-settings-block__delay {
  --ui-text-field-control-max-inline-size: var(--settings-number-inline-size);

  flex: 0 1 var(--settings-text-inline-size);
  min-inline-size: min(100%, 16ch);
  max-inline-size: 100%;
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

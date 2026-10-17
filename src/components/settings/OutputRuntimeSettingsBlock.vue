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
import UiNotice from '../ui/UiNotice.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTextField from '../ui/UiTextField.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

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
  () => outputState.settings,
  (settings) => {
    draftPort.value = String(settings.port);
    draftDisplayDelayMs.value = String(
      settings.displayDelayMs ?? OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
    );
  },
  { deep: true },
);

const busy = computed(
  () =>
    outputState.isStarting ||
    outputState.isStopping ||
    outputState.isSavingSettings,
);
const spoutBusy = computed(
  () =>
    spoutState.isConfiguring || spoutState.isStarting || spoutState.isStopping,
);

function isIntegerInRange(value, min, max) {
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

const hasPortConflict = computed(() => outputState.suggestedPorts.length > 0);
const isSettingsOpen = shallowRef(false);
watch(
  () => hasPortConflict.value || Boolean(outputState.error),
  (needsAttention) => {
    if (needsAttention) isSettingsOpen.value = true;
  },
  { immediate: true },
);
const runtimeStatus = computed(() =>
  describeOutputRuntimeStatus(outputState.status),
);
const serviceStatus = computed(() =>
  hasPortConflict.value
    ? {
        label: '連接埠被占用',
        tone: 'danger',
        detail: '請選擇下方可用的連接埠。',
      }
    : runtimeStatus.value,
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
    ? `${spoutSurface.value.senderName} · ${spoutSurface.value.width} × ${spoutSurface.value.height} · 透明背景`
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
const spoutNotice = computed(
  () =>
    spoutState.error ||
    (spoutPresentation.value.state === 'error'
      ? spoutPresentation.value.detail
      : ''),
);

function commitSettings(overrides = {}) {
  if (busy.value || !isPortValid.value || !isDisplayDelayValid.value) return;
  const current = outputState.settings;
  const next = {
    autoStart: overrides.autoStart ?? current.autoStart,
    port: Number(overrides.port ?? draftPort.value),
    displayDelayMs: Number(
      overrides.displayDelayMs ?? draftDisplayDelayMs.value,
    ),
  };
  const currentDelay =
    current.displayDelayMs ?? OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs;
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
  commitSettings({ port });
}

onMounted(() => {
  output.refreshStatus?.();
  spout.refresh();
});
</script>

<template>
  <div class="output-runtime-settings-block">
    <SettingsDocumentItem
      :icon="Cable"
      title="本機輸出服務"
      :value="serviceStatus.detail"
      :status="serviceStatus.label"
      :status-tone="serviceStatus.tone"
      guidance="供 Browser Source 顯示歌詞與曲目。"
      variant="nested"
    >
      <template #actions>
        <UiCheckbox
          id="output-runtime-auto-start"
          label="自動啟動"
          aria-label="開啟應用程式時自動啟動輸出服務"
          :model-value="outputState.settings.autoStart"
          :disabled="busy"
          @update:model-value="commitSettings({ autoStart: $event })"
        />
        <UiButton
          v-if="!outputState.status.running"
          :icon="Play"
          variant="accent"
          :disabled="busy"
          @click="output.start()"
        >
          啟動
        </UiButton>
        <UiButton v-else :icon="Power" :disabled="busy" @click="output.stop()">
          停止
        </UiButton>
      </template>
    </SettingsDocumentItem>

    <UiDisclosure v-model:open="isSettingsOpen" label="連接埠與畫面同步設定">
      <div class="output-runtime-settings-block__form">
        <div class="output-runtime-settings-block__fields">
          <UiTextField
            id="output-runtime-port"
            v-model="draftPort"
            class="output-runtime-settings-block__number"
            label="連接埠"
            inputmode="numeric"
            :invalid="!isPortValid"
            :disabled="busy"
            @change="commitSettings()"
            @keydown.enter.prevent="commitSettings()"
          />
          <UiTextField
            id="output-display-delay"
            v-model="draftDisplayDelayMs"
            class="output-runtime-settings-block__delay"
            label="畫面延遲（毫秒）"
            hint="畫面比聲音快就調大，慢就調小。"
            inputmode="numeric"
            :invalid="!isDisplayDelayValid"
            :disabled="busy"
            @change="commitSettings()"
            @keydown.enter.prevent="commitSettings()"
          />
        </div>

        <div
          v-if="hasPortConflict"
          class="output-runtime-settings-block__suggestions"
          role="group"
          aria-label="可用連接埠"
        >
          <span>可用連接埠</span>
          <UiButton
            v-for="port in outputState.suggestedPorts"
            :key="port"
            :active="Number(draftPort) === port"
            :disabled="busy"
            @click="chooseSuggestedPort(port)"
          >
            {{ port }}
          </UiButton>
        </div>
      </div>
    </UiDisclosure>

    <UiNotice
      v-if="outputState.error"
      tone="danger"
      title="輸出操作未完成"
      :message="outputState.error"
      compact
    />

    <SettingsDocumentItem
      :icon="MonitorUp"
      title="Spout2 輸出"
      :value="spoutValue"
      :status="spoutPresentation.label"
      :status-tone="spoutPresentation.tone"
      guidance="實驗性：將透明歌詞畫面輸出至 Spout2 軟體。"
      variant="nested"
    >
      <template #actions>
        <UiSegmentedControl
          :items="FRAME_RATE_ITEMS"
          :model-value="spoutFrameRate"
          aria-label="Spout2 幀率"
          :disabled="spoutBusy || spoutActive || !spoutSupported"
          @update:model-value="spout.setFrameRateProfile($event)"
        />
        <UiButton
          v-if="!spoutSending"
          :icon="Play"
          variant="accent"
          :disabled="spoutBusy || !spoutSupported"
          @click="spout.start()"
        >
          啟動
        </UiButton>
        <UiButton
          v-else
          :icon="Power"
          :disabled="spoutBusy"
          @click="spout.stop()"
        >
          停止
        </UiButton>
      </template>
    </SettingsDocumentItem>

    <UiNotice
      v-if="spoutNotice"
      tone="danger"
      title="Spout2 操作未完成"
      :message="spoutNotice"
      compact
    />
  </div>
</template>

<style scoped>
.output-runtime-settings-block {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.output-runtime-settings-block__form {
  display: grid;
  gap: var(--ui-space-2);
  padding-inline-start: var(--ui-space-2);
}

.output-runtime-settings-block__fields {
  display: flex;
  align-items: start;
  gap: var(--ui-space-3);
}

/* Five port digits; the delay field keeps room for its hint. */
.output-runtime-settings-block__number {
  flex: 0 0 6.5rem;
}

.output-runtime-settings-block__delay {
  flex: 0 1 16rem;
  min-width: 0;
}

.output-runtime-settings-block__suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}
</style>

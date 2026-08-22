<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  BadgeCheck,
  Cable,
  CircleAlert,
  CircleDashed,
  CircleX,
  Clock,
  Play,
  Power,
  Settings,
} from '../../icons/index.js';
import OUTPUT_RUNTIME_VALUES from '../../../shared/outputRuntimeValues.json';
import { isOutputPortConflict } from '../../utils/outputRuntimeError.js';
import SettingsActionRow from '../settings/SettingsActionRow.vue';
import SettingsBlock from '../settings/SettingsBlock.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  status: { type: Object, default: () => ({ running: false }) },
  settings: {
    type: Object,
    default: () => ({
      autoStart: true,
      port: OUTPUT_RUNTIME_VALUES.defaultPort,
      displayDelayMs: OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
    }),
  },
  suggestedPorts: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['save', 'start', 'stop']);
const draftAutoStart = shallowRef(props.settings.autoStart);
const draftPort = shallowRef(props.settings.port);
const draftDisplayDelayMs = shallowRef(
  props.settings.displayDelayMs ?? OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
);

watch(
  () => props.settings,
  (settings) => {
    draftAutoStart.value = settings.autoStart;
    draftPort.value = settings.port;
    draftDisplayDelayMs.value =
      settings.displayDelayMs ?? OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs;
  },
  { deep: true },
);

const normalizedPort = computed(() => Number(draftPort.value));
const isPortValid = computed(
  () =>
    Number.isSafeInteger(normalizedPort.value) &&
    normalizedPort.value >= OUTPUT_RUNTIME_VALUES.minPort &&
    normalizedPort.value <= OUTPUT_RUNTIME_VALUES.maxPort,
);
const normalizedDisplayDelayMs = computed(() =>
  Number(draftDisplayDelayMs.value),
);
const isDisplayDelayValid = computed(
  () =>
    Number.isSafeInteger(normalizedDisplayDelayMs.value) &&
    normalizedDisplayDelayMs.value >= OUTPUT_RUNTIME_VALUES.minDisplayDelayMs &&
    normalizedDisplayDelayMs.value <= OUTPUT_RUNTIME_VALUES.maxDisplayDelayMs,
);
const displayDelayLabel = computed(() => {
  const value = normalizedDisplayDelayMs.value;
  if (!Number.isFinite(value)) return '數值無效';
  if (value === 0) return '0 毫秒';
  return `${value > 0 ? '+' : ''}${value} 毫秒`;
});
const hasPortConflict = computed(() => isOutputPortConflict(props.error));
const statusLabel = computed(() => {
  if (hasPortConflict.value) return 'Port 被占用';
  if ((props.status.clients ?? 0) > 0) return 'Browser Source 已連線';
  if (props.status.running) return '服務可用';
  return '服務已停止';
});
const statusTone = computed(() => {
  if (hasPortConflict.value) return 'danger';
  if ((props.status.clients ?? 0) > 0) return 'success';
  if (props.status.running) return 'accent';
  return 'muted';
});
const serviceStatusIcon = computed(() => {
  if (hasPortConflict.value) return CircleAlert;
  if ((props.status.clients ?? 0) > 0) return BadgeCheck;
  if (props.status.running) return CircleDashed;
  return CircleX;
});
const serviceStatusValue = computed(() => {
  if (hasPortConflict.value) return props.error || '請改用其他 Port。';
  if (props.status.running) {
    const clients = props.status.clients ?? 0;
    return clients > 0
      ? `${clients} 個 Browser Source 連線`
      : '等待 Browser Source 連線';
  }
  return '本機服務未啟動。';
});

function commitSettings(overrides = {}) {
  if (props.busy) return;
  const autoStart = overrides.autoStart ?? draftAutoStart.value;
  const port = Number(overrides.port ?? draftPort.value);
  const displayDelayMs = Number(
    overrides.displayDelayMs ?? draftDisplayDelayMs.value,
  );
  const hasChanged =
    autoStart !== props.settings.autoStart ||
    port !== props.settings.port ||
    displayDelayMs !==
      (props.settings.displayDelayMs ??
        OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs);
  if (!isPortValid.value || !isDisplayDelayValid.value || !hasChanged) return;
  emit('save', {
    autoStart,
    port,
    displayDelayMs,
  });
}

function chooseSuggestedPort(port) {
  draftPort.value = port;
  commitSettings({ port });
}
</script>

<template>
  <section class="obs-output-settings" aria-label="輸出設定">
    <div class="obs-output-settings__grid">
      <SettingsBlock
        title="本機輸出服務"
        summary="管理本機 Browser Source 輸出服務。"
        :status="statusLabel"
        :status-tone="statusTone"
      >
        <SettingsActionRow
          :icon="serviceStatusIcon"
          title="服務狀態"
          :value="serviceStatusValue"
          :status="statusLabel"
          :status-tone="statusTone"
        >
          <template #actions>
            <UiButton
              v-if="!status.running"
              class="obs-output-settings__command"
              :icon="Play"
              variant="accent"
              :disabled="busy"
              @click="emit('start')"
            >
              啟動
            </UiButton>
            <UiButton
              v-else
              class="obs-output-settings__command"
              :icon="Power"
              :disabled="busy"
              @click="emit('stop')"
            >
              停止
            </UiButton>
          </template>
        </SettingsActionRow>

        <SettingsActionRow
          :icon="Settings"
          title="啟動方式"
          :status="draftAutoStart ? '自動' : '手動'"
          :status-tone="draftAutoStart ? 'accent' : 'muted'"
        >
          <template #actions>
            <label class="obs-output-settings__toggle">
              <input
                v-model="draftAutoStart"
                type="checkbox"
                :disabled="busy"
                @change="commitSettings()"
              />
              <span>自動啟動</span>
            </label>
          </template>
        </SettingsActionRow>

        <SettingsActionRow
          :icon="Cable"
          title="本機 Port"
          :value="`${OUTPUT_RUNTIME_VALUES.host}:${draftPort}`"
        >
          <template #actions>
            <div class="obs-output-settings__port-control">
              <label class="visually-hidden" for="output-runtime-port">
                本機輸出 Port
              </label>
              <input
                id="output-runtime-port"
                v-model="draftPort"
                class="obs-output-settings__port-input"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                :disabled="busy"
                :aria-invalid="!isPortValid"
                @change="commitSettings()"
                @keydown.enter.prevent="commitSettings()"
              />
            </div>
          </template>
        </SettingsActionRow>

        <SettingsActionRow
          :icon="Clock"
          title="顯示同步補償"
          :value="displayDelayLabel"
        >
          <template #actions>
            <div class="obs-output-settings__delay-control">
              <label class="visually-hidden" for="output-display-delay">
                顯示同步補償毫秒
              </label>
              <input
                id="output-display-delay"
                v-model="draftDisplayDelayMs"
                class="obs-output-settings__delay-input"
                type="text"
                inputmode="numeric"
                pattern="-?[0-9]*"
                :disabled="busy"
                :aria-invalid="!isDisplayDelayValid"
                @change="commitSettings()"
                @keydown.enter.prevent="commitSettings()"
              />
              <span class="obs-output-settings__unit">毫秒</span>
            </div>
          </template>
        </SettingsActionRow>

        <div
          v-if="suggestedPorts.length"
          class="obs-output-settings__suggestions"
          aria-label="可用 Port"
        >
          <span>可用 Port</span>
          <UiButton
            v-for="port in suggestedPorts"
            :key="port"
            :active="normalizedPort === port"
            :disabled="busy"
            @click="chooseSuggestedPort(port)"
          >
            {{ port }}
          </UiButton>
        </div>
      </SettingsBlock>
    </div>

    <UiHint
      v-if="error"
      class="obs-output-settings__feedback"
      tone="danger"
      role="alert"
      aria-live="polite"
    >
      {{ error }}
    </UiHint>
  </section>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.obs-output-settings {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-4);
  overflow: auto;
}

.obs-output-settings__grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, var(--ui-settings-column-min-width)), 1fr)
  );
  gap: var(--ui-space-5);
  align-items: start;
  align-content: start;
}

.obs-output-settings__port-control,
.obs-output-settings__delay-control,
.obs-output-settings__suggestions,
.obs-output-settings__toggle {
  display: flex;
  align-items: center;
}

.obs-output-settings__port-control,
.obs-output-settings__delay-control,
.obs-output-settings__suggestions,
.obs-output-settings__toggle {
  gap: var(--ui-space-2);
}

.obs-output-settings__toggle {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
}

.obs-output-settings__toggle input {
  width: var(--ui-settings-checkbox-size);
  height: var(--ui-settings-checkbox-size);
  accent-color: var(--ui-color-accent);
}

.obs-output-settings__command {
  min-width: var(--ui-output-settings-command-button-width);
  justify-content: center;
}

.obs-output-settings__port-input,
.obs-output-settings__delay-input {
  width: var(--ui-output-port-input-width);
  height: var(--ui-control-height);
  padding-inline: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.obs-output-settings__port-input:focus-visible,
.obs-output-settings__delay-input:focus-visible,
.obs-output-settings__toggle input:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-output-settings__unit {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.obs-output-settings__suggestions {
  flex-wrap: wrap;
  padding-block: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.obs-output-settings__feedback {
  padding-inline: var(--ui-space-1);
}
</style>

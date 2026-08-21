<script setup>
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { Copy, Play, RefreshCw, Square } from '../../icons/index.js';
import OUTPUT_RUNTIME_VALUES from '../../../shared/outputRuntimeValues.json';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  status: { type: Object, default: () => ({ running: false }) },
  settings: {
    type: Object,
    default: () => ({
      autoStart: true,
      port: OUTPUT_RUNTIME_VALUES.defaultPort,
    }),
  },
  suggestedPorts: { type: Array, default: () => [] },
  obsUrl: { type: String, default: null },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['save', 'start', 'stop', 'suggestPorts']);
const draftAutoStart = shallowRef(props.settings.autoStart);
const draftPort = shallowRef(props.settings.port);
const copyState = shallowRef('idle');
let copyResetTimer = null;

watch(
  () => props.settings,
  (settings) => {
    draftAutoStart.value = settings.autoStart;
    draftPort.value = settings.port;
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
const isDirty = computed(
  () =>
    draftAutoStart.value !== props.settings.autoStart ||
    normalizedPort.value !== props.settings.port,
);
const hasPortConflict = computed(() =>
  /port is already in use|EADDRINUSE/i.test(props.error),
);
const statusLabel = computed(() => {
  if (hasPortConflict.value) return 'Port 被占用';
  if ((props.status.clients ?? 0) > 0) return 'OBS 已連線';
  if (props.status.running) return '服務可用';
  return '服務已停止';
});
const statusTone = computed(() => {
  if (hasPortConflict.value) return 'danger';
  if ((props.status.clients ?? 0) > 0) return 'success';
  if (props.status.running) return 'accent';
  return 'muted';
});
const serviceUrl = computed(
  () =>
    props.status.httpUrl ??
    `http://${OUTPUT_RUNTIME_VALUES.host}:${props.settings.port}`,
);

function save() {
  if (!isPortValid.value || !isDirty.value) return;
  emit('save', {
    autoStart: draftAutoStart.value,
    port: normalizedPort.value,
  });
}

function chooseSuggestedPort(port) {
  draftPort.value = port;
}

async function copyObsUrl() {
  if (!props.obsUrl) return;
  try {
    await navigator.clipboard.writeText(props.obsUrl);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'error';
  }
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle';
  }, 1800);
}

onBeforeUnmount(() => clearTimeout(copyResetTimer));
</script>

<template>
  <section class="obs-output-settings" aria-label="輸出設定">
    <header class="obs-output-settings__header">
      <div>
        <h2 class="obs-output-settings__title">本機輸出服務</h2>
        <p class="obs-output-settings__summary">
          服務固定只接受這台電腦上的 Browser Source 連線。
        </p>
      </div>
      <UiChip :tone="statusTone">{{ statusLabel }}</UiChip>
    </header>

    <div class="obs-output-settings__body">
      <section class="obs-output-settings__section">
        <div class="obs-output-settings__row">
          <div class="obs-output-settings__copy">
            <h3 class="obs-output-settings__row-title">啟動方式</h3>
            <p class="obs-output-settings__row-summary">
              功能授權有效時，開啟 Utawakui 後自動準備輸出服務。
            </p>
          </div>
          <label class="obs-output-settings__toggle">
            <input v-model="draftAutoStart" type="checkbox" />
            <span>{{ draftAutoStart ? '自動啟動' : '手動啟動' }}</span>
          </label>
        </div>

        <div class="obs-output-settings__row">
          <div class="obs-output-settings__copy">
            <h3 class="obs-output-settings__row-title">本機 Port</h3>
            <p class="obs-output-settings__row-summary">
              預設使用 8700；變更後 OBS 內的網址也需要同步更新。
            </p>
          </div>
          <div class="obs-output-settings__port-control">
            <label class="visually-hidden" for="output-runtime-port">
              本機輸出 Port
            </label>
            <input
              id="output-runtime-port"
              v-model="draftPort"
              class="obs-output-settings__port-input"
              type="number"
              :min="OUTPUT_RUNTIME_VALUES.minPort"
              :max="OUTPUT_RUNTIME_VALUES.maxPort"
              step="1"
              inputmode="numeric"
            />
            <UiButton
              variant="accent"
              :disabled="busy || !isDirty || !isPortValid"
              @click="save"
            >
              套用
            </UiButton>
          </div>
        </div>

        <div
          v-if="suggestedPorts.length"
          class="obs-output-settings__suggestions"
        >
          <span>可用建議</span>
          <button
            v-for="port in suggestedPorts"
            :key="port"
            type="button"
            class="obs-output-settings__suggestion"
            @click="chooseSuggestedPort(port)"
          >
            {{ port }}
          </button>
        </div>
      </section>

      <section class="obs-output-settings__section">
        <div class="obs-output-settings__row">
          <div class="obs-output-settings__copy">
            <h3 class="obs-output-settings__row-title">服務狀態</h3>
            <p class="obs-output-settings__row-summary">{{ serviceUrl }}</p>
          </div>
          <div class="obs-output-settings__actions">
            <UiButton
              :icon="RefreshCw"
              :disabled="busy"
              title="重新檢查可用 Port"
              @click="emit('suggestPorts')"
            >
              檢查 Port
            </UiButton>
            <UiButton
              v-if="!status.running"
              :icon="Play"
              variant="accent"
              :disabled="busy"
              @click="emit('start')"
            >
              啟動服務
            </UiButton>
            <UiButton
              v-else
              :icon="Square"
              :disabled="busy"
              @click="emit('stop')"
            >
              暫停服務
            </UiButton>
          </div>
        </div>

        <div v-if="obsUrl" class="obs-output-settings__url-row">
          <div class="obs-output-settings__copy">
            <h3 class="obs-output-settings__row-title">目前模板 URL</h3>
            <p class="obs-output-settings__url">{{ obsUrl }}</p>
          </div>
          <UiButton
            :icon="Copy"
            title="複製 OBS URL"
            aria-label="複製 OBS URL"
            @click="copyObsUrl"
          />
        </div>
      </section>
    </div>

    <p
      v-if="error || copyState !== 'idle'"
      class="obs-output-settings__feedback"
      :data-error="Boolean(error || copyState === 'error')"
      aria-live="polite"
    >
      <template v-if="copyState === 'copied'">已複製 OBS URL</template>
      <template v-else-if="copyState === 'error'">無法複製 URL</template>
      <template v-else>{{ error }}</template>
    </p>
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
  width: min(100%, var(--ui-output-settings-max-width));
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-4);
  margin-inline: auto;
  overflow: auto;
}

.obs-output-settings__header,
.obs-output-settings__row,
.obs-output-settings__url-row,
.obs-output-settings__actions,
.obs-output-settings__port-control,
.obs-output-settings__suggestions,
.obs-output-settings__toggle {
  display: flex;
  align-items: center;
}

.obs-output-settings__header,
.obs-output-settings__row,
.obs-output-settings__url-row {
  justify-content: space-between;
  gap: var(--ui-space-4);
}

.obs-output-settings__title,
.obs-output-settings__row-title {
  margin: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.obs-output-settings__title {
  font-size: var(--ui-font-size-lg);
}

.obs-output-settings__row-title {
  font-size: var(--ui-font-size-md);
}

.obs-output-settings__summary,
.obs-output-settings__row-summary,
.obs-output-settings__url,
.obs-output-settings__feedback {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-output-settings__body {
  display: grid;
  gap: var(--ui-space-5);
}

.obs-output-settings__section {
  display: grid;
  gap: 0;
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-output-settings__row,
.obs-output-settings__url-row {
  min-height: var(--ui-output-settings-row-min-height);
  padding-block: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-output-settings__copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.obs-output-settings__actions,
.obs-output-settings__port-control,
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
  width: 1rem;
  height: 1rem;
  accent-color: var(--ui-color-accent);
}

.obs-output-settings__port-input {
  width: var(--ui-output-port-input-width);
  height: var(--ui-control-height);
  padding-inline: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
}

.obs-output-settings__port-input:focus-visible,
.obs-output-settings__suggestion:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-output-settings__suggestions {
  flex-wrap: wrap;
  padding-block: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.obs-output-settings__suggestion {
  min-height: var(--ui-control-height);
  padding-inline: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font: inherit;
  cursor: pointer;
}

.obs-output-settings__suggestion:hover {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
}

.obs-output-settings__url {
  overflow-wrap: anywhere;
}

.obs-output-settings__feedback[data-error='true'] {
  color: var(--ui-color-danger);
}

@media (max-width: 680px) {
  .obs-output-settings__header,
  .obs-output-settings__row,
  .obs-output-settings__url-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .obs-output-settings__actions {
    flex-wrap: wrap;
  }
}
</style>

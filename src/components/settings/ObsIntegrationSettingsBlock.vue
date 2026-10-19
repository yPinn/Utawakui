<script setup>
import { computed, nextTick, shallowRef, watch } from 'vue';
import { Play, Power, Video } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import { usePlaybackDockPreference } from '../../composables/usePlaybackDockPreference.js';
import UiTextField from '../ui/UiTextField.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import obsConnectionValues from '../../../shared/obsConnectionValues.json';
import obsSessionValues from '../../../shared/obsSessionValues.json';

const MAX_PASSWORD_LENGTH = obsConnectionValues.maxPasswordLength;
const DEFAULT_HOST = obsConnectionValues.defaultHost;
const DEFAULT_PORT = String(obsConnectionValues.defaultPort);
const dockPreference = usePlaybackDockPreference();

const props = defineProps({
  status: { type: Object, required: true },
  featureEnabled: { type: Boolean, default: true },
  host: { type: String, default: () => obsConnectionValues.defaultHost },
  port: {
    type: String,
    default: () => String(obsConnectionValues.defaultPort),
  },
  password: { type: String, default: '' },
  skipThresholdSeconds: {
    type: String,
    default: () =>
      String(Math.round(obsSessionValues.defaultSkipThresholdMs / 1000)),
  },
  hasStoredPassword: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  fieldErrors: { type: Object, default: () => ({}) },
  validationAttempt: { type: Number, default: 0 },
  readError: { type: String, default: '' },
  saveError: { type: String, default: '' },
  passwordError: { type: String, default: '' },
  connectionError: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:host',
  'update:port',
  'update:password',
  'update:skipThresholdSeconds',
  'refreshSettings',
  'refreshStatus',
  'save',
  'clearPassword',
  'retryConnect',
  'exportChapters',
]);

const LIFECYCLE_LABELS = Object.freeze({
  disabled: '未啟用',
  disconnected: '未連線',
  connecting: '連線中',
  authenticating: '驗證中',
  ready: '已連線',
  degraded: '連線異常',
  error: '連線失敗',
});
const LIFECYCLE_TONES = Object.freeze({
  disabled: 'muted',
  disconnected: 'muted',
  connecting: 'info',
  authenticating: 'info',
  ready: 'success',
  degraded: 'warning',
  error: 'danger',
});
const CONNECTED_LIFECYCLES = Object.freeze(['ready', 'degraded']);
const RETRYABLE_LIFECYCLES = Object.freeze([
  'disconnected',
  'degraded',
  'error',
]);

const lifecycle = computed(
  () => props.status?.observed?.lifecycle ?? 'disabled',
);
const statusLabel = computed(() =>
  props.status.statusReadError
    ? '無法讀取'
    : (LIFECYCLE_LABELS[lifecycle.value] ?? lifecycle.value),
);
const statusTone = computed(() =>
  props.status.statusReadError
    ? 'warning'
    : (LIFECYCLE_TONES[lifecycle.value] ?? 'muted'),
);
const isEnabled = computed(() => props.status?.desired?.enabled === true);
const canRetry = computed(
  () =>
    props.featureEnabled &&
    isEnabled.value &&
    RETRYABLE_LIFECYCLES.includes(lifecycle.value),
);

const outputSummary = computed(() => {
  if (!CONNECTED_LIFECYCLES.includes(lifecycle.value)) {
    return '連線後顯示直播與錄影狀態';
  }
  const streaming = props.status?.observed?.streaming;
  const recording = props.status?.observed?.recording;
  const parts = [
    streaming?.active ? '直播中' : '未直播',
    recording?.active ? '錄影中' : '未錄影',
  ];
  return parts.join('・');
});

const fieldRefs = {};
watch(
  () => props.validationAttempt,
  async () => {
    const errors = props.fieldErrors;
    const first = Object.keys(errors).find((key) => errors[key]);
    if (!first) return;
    isConnectionSettingsOpen.value = true;
    await nextTick();
    fieldRefs[first]?.focus?.();
  },
);
const isConnectionSettingsOpen = shallowRef(false);
watch(
  () => [
    props.error,
    props.readError,
    props.saveError,
    props.status?.error,
    isEnabled.value,
    lifecycle.value,
  ],
  () => {
    if (
      props.error ||
      props.readError ||
      props.saveError ||
      props.status?.error ||
      (isEnabled.value && lifecycle.value === 'disconnected')
    ) {
      isConnectionSettingsOpen.value = true;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="obs-integration-settings-block">
    <SettingsDocumentItem
      :icon="Video"
      title="WebSocket 連線"
      :value="outputSummary"
      :status="statusLabel"
      :status-tone="statusTone"
      guidance="讀取直播／錄影與時間標記，不變更場景。"
      variant="nested"
    >
      <template #actions>
        <UiButton
          v-if="canRetry"
          variant="ghost"
          :loading="isSaving"
          @click="emit('retryConnect')"
        >
          重試連線
        </UiButton>
        <UiButton
          v-if="featureEnabled"
          id="obs-integration-enabled"
          :icon="isEnabled ? Power : Play"
          :variant="isEnabled ? 'secondary' : 'accent'"
          :aria-label="isEnabled ? '停止 OBS 連線' : '連線至 OBS'"
          :disabled="isSaving || isLoading || Boolean(readError)"
          @click="emit('save', { enabled: !isEnabled })"
          >{{ isEnabled ? '停止連線' : '連線' }}</UiButton
        >
      </template>
      <template
        v-if="status?.error || connectionError || status.statusReadError"
        #feedback
      >
        <UiHint
          v-if="status?.error || connectionError"
          tone="warning"
          role="alert"
          >{{ status?.error?.message || connectionError }}</UiHint
        >
        <UiHint v-if="status.statusReadError" tone="danger" role="alert">{{
          status.statusReadError
        }}</UiHint>
        <UiButton
          v-if="status.statusReadError"
          variant="ghost"
          @click="emit('refreshStatus')"
          >重新讀取 OBS 狀態</UiButton
        >
      </template>
    </SettingsDocumentItem>
    <UiCheckbox
      id="obs-auto-arrangement-dock"
      label="OBS 連線後顯示播放安排"
      hint="預設關閉。僅依 WebSocket 已連線狀態顯示側欄；可隨時收合或切換，不會開始播放。"
      :model-value="dockPreference.value.value"
      :disabled="dockPreference.busy.value || dockPreference.reading.value"
      :error="dockPreference.error.value"
      @update:model-value="dockPreference.save"
    />
    <UiButton
      v-if="dockPreference.readError.value"
      variant="ghost"
      @click="dockPreference.refresh"
      >重新讀取顯示偏好</UiButton
    >
    <UiHint v-if="readError" tone="danger" role="alert">{{ readError }}</UiHint>
    <UiButton
      v-if="readError"
      variant="ghost"
      :loading="isLoading"
      @click="emit('refreshSettings')"
      >重新讀取 OBS 設定</UiButton
    >

    <div
      v-if="(!featureEnabled || !isEnabled) && hasStoredPassword"
      class="obs-integration-settings-block__stored-credential"
    >
      <span>已儲存 OBS 密碼</span>
      <UiButton
        variant="ghost"
        :disabled="isSaving"
        intent="danger"
        @click="emit('clearPassword')"
      >
        移除密碼
      </UiButton>
    </div>

    <UiHint
      v-if="passwordError && (!featureEnabled || !isEnabled)"
      tone="danger"
      role="alert"
      >{{ passwordError }}</UiHint
    >

    <UiDisclosure
      v-if="
        featureEnabled &&
        (isEnabled || saveError || Object.values(fieldErrors).some(Boolean))
      "
      v-model:open="isConnectionSettingsOpen"
      class="settings-section__disclosure"
      label="伺服器與場次設定"
    >
      <div class="obs-integration-settings-block__form">
        <div class="obs-integration-settings-block__connection">
          <UiTextField
            id="obs-integration-host"
            :ref="
              (instance) => {
                fieldRefs.host = instance;
              }
            "
            :error="fieldErrors.host"
            class="obs-integration-settings-block__host"
            label="主機"
            :model-value="host"
            :placeholder="DEFAULT_HOST"
            :disabled="isSaving || isLoading || Boolean(readError)"
            @update:model-value="emit('update:host', $event)"
          />
          <UiTextField
            id="obs-integration-port"
            :ref="
              (instance) => {
                fieldRefs.port = instance;
              }
            "
            :error="fieldErrors.port"
            class="obs-integration-settings-block__port"
            label="連接埠"
            :model-value="port"
            :placeholder="DEFAULT_PORT"
            :disabled="isSaving || isLoading || Boolean(readError)"
            @update:model-value="emit('update:port', $event)"
          />
        </div>

        <div class="obs-integration-settings-block__credential">
          <UiTextField
            id="obs-integration-password"
            :ref="
              (instance) => {
                fieldRefs.password = instance;
              }
            "
            :error="fieldErrors.password"
            class="obs-integration-settings-block__password"
            label="密碼"
            type="password"
            :model-value="password"
            :placeholder="hasStoredPassword ? '已設定；留空不變更' : ''"
            :maxlength="MAX_PASSWORD_LENGTH"
            autocomplete="off"
            :disabled="isSaving || isLoading || Boolean(readError)"
            @update:model-value="emit('update:password', $event)"
          />
          <UiButton
            v-if="hasStoredPassword"
            variant="ghost"
            :disabled="isSaving || isLoading || Boolean(readError)"
            intent="danger"
            @click="emit('clearPassword')"
          >
            移除密碼
          </UiButton>
        </div>

        <UiHint v-if="passwordError && isEnabled" tone="danger" role="alert">{{
          passwordError
        }}</UiHint>

        <UiTextField
          id="obs-integration-skip-threshold"
          :ref="
            (instance) => {
              fieldRefs.skipThresholdSeconds = instance;
            }
          "
          :error="fieldErrors.skipThresholdSeconds"
          label="略過門檻（秒）"
          :model-value="skipThresholdSeconds"
          placeholder="10"
          hint="短於此秒數就換下一首，且不記錄；0 表示停用。"
          :disabled="isSaving || isLoading || Boolean(readError)"
          @update:model-value="emit('update:skipThresholdSeconds', $event)"
        />

        <UiHint v-if="saveError" tone="danger" role="alert">{{
          saveError
        }}</UiHint>
        <div class="obs-integration-settings-block__submit">
          <UiButton
            variant="accent"
            :loading="isSaving"
            @click="emit('save', { enabled: true })"
          >
            儲存設定
          </UiButton>
        </div>
      </div>
    </UiDisclosure>

    <div v-if="featureEnabled" class="obs-integration-settings-block__export">
      <UiButton variant="ghost" @click="emit('exportChapters')">
        匯出時間標記
      </UiButton>
    </div>

    <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
  </div>
</template>

<style scoped>
.obs-integration-settings-block {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-integration-settings-block__form {
  /* Three logical groups, not one flat grid of equal-weight cells — the
     connection target (host/port), the credential, and the commit action
     each read as their own unit, separated by --ui-space-3 (tighter than
     the --ui-space-5 page-level rhythm DESIGN.md reserves for real section
     breaks, since this is still one small settings row, not a new page). */
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding-inline-start: var(--settings-copy-inset, 0);
}

.obs-integration-settings-block__stored-credential {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding-inline-start: var(--settings-copy-inset, 0);
  color: var(--ui-color-text-muted);
}

.obs-integration-settings-block__connection {
  /* Host and port stay tightly paired (--ui-space-2) — they're one address,
     not two unrelated fields. */
  display: flex;
  align-items: start;
  gap: var(--ui-space-2);
}

.obs-integration-settings-block__host {
  flex: 1 1 auto;
  min-width: 0;
}

.obs-integration-settings-block__port {
  /* Fixed to what a 1-5 digit port number actually needs, not stretched to
     match the host field — equal-width columns for unequal content is the
     "monotonous grid" this replaces. */
  flex: 0 0 var(--settings-port-inline-size);
}

.obs-integration-settings-block__credential {
  display: flex;
  align-items: start;
  gap: var(--ui-space-2);
}

.obs-integration-settings-block__password {
  flex: 1 1 auto;
  min-width: 0;
}

.obs-integration-settings-block__submit {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

.obs-integration-settings-block__export {
  display: flex;
  justify-content: flex-end;
}
</style>

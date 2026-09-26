<script setup>
import { computed } from 'vue';
import { Video } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import SettingsActionRow from './SettingsActionRow.vue';
import obsConnectionValues from '../../../shared/obsConnectionValues.json';

const MAX_PASSWORD_LENGTH = obsConnectionValues.maxPasswordLength;

const props = defineProps({
  status: { type: Object, required: true },
  featureEnabled: { type: Boolean, default: true },
  host: { type: String, default: '127.0.0.1' },
  port: { type: String, default: '4455' },
  password: { type: String, default: '' },
  skipThresholdSeconds: { type: String, default: '10' },
  hasStoredPassword: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits([
  'update:host',
  'update:port',
  'update:password',
  'update:skipThresholdSeconds',
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
const statusLabel = computed(
  () => LIFECYCLE_LABELS[lifecycle.value] ?? lifecycle.value,
);
const statusTone = computed(() => LIFECYCLE_TONES[lifecycle.value] ?? 'muted');
const isEnabled = computed(() => props.status?.desired?.enabled === true);
const canRetry = computed(
  () =>
    props.featureEnabled &&
    isEnabled.value &&
    RETRYABLE_LIFECYCLES.includes(lifecycle.value),
);

const outputSummary = computed(() => {
  if (!CONNECTED_LIFECYCLES.includes(lifecycle.value)) {
    return '連線至 OBS 以讀取直播／錄影時間戳';
  }
  const streaming = props.status?.observed?.streaming;
  const recording = props.status?.observed?.recording;
  const parts = [
    streaming?.active ? '直播中' : '未直播',
    recording?.active ? '錄影中' : '未錄影',
  ];
  return parts.join('・');
});
</script>

<template>
  <div class="obs-integration-settings-block">
    <SettingsActionRow
      :icon="Video"
      title="OBS 連線"
      :value="outputSummary"
      :status="statusLabel"
      :status-tone="statusTone"
      tooltip="僅讀取 OBS 直播／錄影狀態與時間戳，不會建立或變更場景。"
      variant="subtle"
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
        <UiCheckbox
          v-if="featureEnabled"
          id="obs-integration-enabled"
          label="啟用"
          aria-label="啟用 OBS 連線"
          :model-value="isEnabled"
          :disabled="isSaving"
          @update:model-value="emit('save', { enabled: $event })"
        />
      </template>
    </SettingsActionRow>

    <div
      v-if="(!featureEnabled || !isEnabled) && hasStoredPassword"
      class="obs-integration-settings-block__stored-credential"
    >
      <span>這台電腦已儲存 OBS 密碼</span>
      <UiButton
        variant="ghost"
        :disabled="isSaving"
        @click="emit('clearPassword')"
      >
        移除已儲存密碼
      </UiButton>
    </div>

    <div
      v-if="featureEnabled && isEnabled"
      class="obs-integration-settings-block__form"
    >
      <div class="obs-integration-settings-block__connection">
        <UiTextField
          id="obs-integration-host"
          class="obs-integration-settings-block__host"
          label="主機"
          :model-value="host"
          placeholder="127.0.0.1"
          :disabled="isSaving"
          @update:model-value="emit('update:host', $event)"
        />
        <UiTextField
          id="obs-integration-port"
          class="obs-integration-settings-block__port"
          label="連接埠"
          :model-value="port"
          placeholder="4455"
          :disabled="isSaving"
          @update:model-value="emit('update:port', $event)"
        />
      </div>

      <div class="obs-integration-settings-block__credential">
        <UiTextField
          id="obs-integration-password"
          class="obs-integration-settings-block__password"
          label="密碼"
          type="password"
          :model-value="password"
          :placeholder="hasStoredPassword ? '已設定，留空表示不變更' : ''"
          :maxlength="MAX_PASSWORD_LENGTH"
          autocomplete="off"
          :disabled="isSaving"
          @update:model-value="emit('update:password', $event)"
        />
        <UiButton
          v-if="hasStoredPassword"
          variant="ghost"
          :disabled="isSaving"
          @click="emit('clearPassword')"
        >
          移除已儲存密碼
        </UiButton>
      </div>

      <UiTextField
        id="obs-integration-skip-threshold"
        label="略過門檻（秒）"
        :model-value="skipThresholdSeconds"
        placeholder="10"
        hint="曲目播放短於此秒數就換下一首，不記錄進場次歷史；設為 0 停用。"
        :disabled="isSaving"
        @update:model-value="emit('update:skipThresholdSeconds', $event)"
      />

      <div class="obs-integration-settings-block__submit">
        <UiButton variant="ghost" @click="emit('exportChapters')">
          匯出時間標記
        </UiButton>
        <UiButton
          variant="accent"
          :loading="isSaving"
          @click="emit('save', { enabled: true })"
        >
          儲存設定
        </UiButton>
      </div>
    </div>

    <UiNotice
      v-if="error"
      tone="danger"
      title="OBS 連線設定未儲存"
      :message="error"
      compact
    />
    <UiNotice
      v-else-if="status?.error"
      tone="warning"
      :title="status.error.message"
      compact
    />
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
  padding-inline-start: var(--ui-space-2);
}

.obs-integration-settings-block__stored-credential {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding-inline-start: var(--ui-space-2);
  color: var(--ui-text-muted);
}

.obs-integration-settings-block__connection {
  /* Host and port stay tightly paired (--ui-space-2) — they're one address,
     not two unrelated fields. */
  display: flex;
  align-items: end;
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
  flex: 0 0 6.5rem;
}

.obs-integration-settings-block__credential {
  display: flex;
  align-items: end;
  gap: var(--ui-space-2);
}

.obs-integration-settings-block__password {
  flex: 1 1 auto;
  min-width: 0;
}

.obs-integration-settings-block__submit {
  /* Secondary action (export) left, primary commit (save) right — same
     footer convention as most dialogs, not two buttons stacked flush
     together at one edge. */
  display: flex;
  justify-content: space-between;
  gap: var(--ui-space-2);
}
</style>

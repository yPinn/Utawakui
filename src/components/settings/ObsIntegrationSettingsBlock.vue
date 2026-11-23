<script setup>
import { computed, nextTick, shallowRef, watch } from 'vue';
import { Power, RefreshCw, Trash2 } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { usePlaybackDockPreference } from '../../composables/usePlaybackDockPreference.js';
import UiTextField from '../ui/UiTextField.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import obsConnectionValues from '../../../shared/obsConnectionValues.json';
import obsSessionValues from '../../../shared/obsSessionValues.json';
import { t } from '../../utils/i18n.js';

const MAX_PASSWORD_LENGTH = obsConnectionValues.maxPasswordLength;
const DEFAULT_HOST = obsConnectionValues.defaultHost;
const DEFAULT_PORT = String(obsConnectionValues.defaultPort);
const DEFAULT_SKIP_THRESHOLD_SECONDS = String(
  obsSessionValues.defaultSkipThresholdMs / 1000,
);
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
    default: () => String(obsSessionValues.defaultSkipThresholdMs / 1000),
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
]);

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
    ? t('obs.unreadable')
    : LIFECYCLE_TONES[lifecycle.value]
      ? t(`obs.lifecycle.${lifecycle.value}`)
      : lifecycle.value,
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
const statusFeedback = computed(
  () =>
    props.readError ||
    props.status.statusReadError ||
    props.error ||
    props.status.error?.message ||
    props.connectionError,
);

const outputSummary = computed(() => {
  if (
    props.status.statusReadError ||
    !CONNECTED_LIFECYCLES.includes(lifecycle.value)
  )
    return '';
  const streaming = props.status?.observed?.streaming;
  const recording = props.status?.observed?.recording;
  return t('obs.summary', {
    streaming: t(streaming?.active ? 'obs.streaming' : 'obs.notStreaming'),
    recording: t(recording?.active ? 'obs.recording' : 'obs.notRecording'),
  });
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
      :title="t('obs.title')"
      :value="outputSummary"
      :status="statusLabel"
      :status-tone="statusTone"
      variant="nested"
    >
      <template #actions>
        <UiButton
          v-if="featureEnabled && isEnabled"
          id="obs-integration-enabled"
          :icon="Power"
          variant="secondary"
          :aria-label="t('obs.disconnectLabel')"
          :disabled="isSaving || isLoading || Boolean(readError)"
          @click="emit('save', { enabled: false })"
          >{{ t('obs.disconnect') }}</UiButton
        >
        <UiButton
          v-if="canRetry"
          :icon="RefreshCw"
          variant="accent"
          :disabled="isSaving || isLoading"
          @click="emit('retryConnect')"
          >{{ t('obs.retry') }}</UiButton
        >
      </template>
      <template v-if="statusFeedback" #feedback>
        <UiHint
          :tone="
            readError || status.statusReadError || error ? 'danger' : 'warning'
          "
          role="alert"
          >{{ statusFeedback }}</UiHint
        >
        <UiButton
          v-if="readError"
          variant="ghost"
          :loading="isLoading"
          @click="emit('refreshSettings')"
          >{{ t('obs.reloadSettings') }}</UiButton
        >
        <UiButton
          v-else-if="status.statusReadError"
          variant="ghost"
          @click="emit('refreshStatus')"
          >{{ t('obs.reloadStatus') }}</UiButton
        >
      </template>
    </SettingsDocumentItem>

    <SettingsDocumentItem
      v-if="(!featureEnabled || !isEnabled) && hasStoredPassword"
      variant="nested"
      title-tag="span"
      :title="t('obs.passwordSaved')"
    >
      <template #actions>
        <UiButton
          variant="ghost"
          :disabled="isSaving"
          intent="danger"
          @click="emit('clearPassword')"
        >
          {{ t('obs.removePassword') }}
        </UiButton>
      </template>
      <template v-if="passwordError" #feedback>
        <UiHint tone="danger" role="alert">{{ passwordError }}</UiHint>
      </template>
    </SettingsDocumentItem>

    <UiDisclosure
      v-if="featureEnabled"
      v-model:open="isConnectionSettingsOpen"
      class="settings-section__disclosure"
      :label="t('obs.settings')"
    >
      <div class="settings-section__form">
        <UiHint v-if="!isEnabled || canRetry">{{
          t('obs.setupGuidance')
        }}</UiHint>
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
            :label="t('obs.host')"
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
            class="settings-section__port-field"
            :label="t('obs.port')"
            :model-value="port"
            :placeholder="DEFAULT_PORT"
            :disabled="isSaving || isLoading || Boolean(readError)"
            @update:model-value="emit('update:port', $event)"
          />
        </div>

        <UiTextField
          id="obs-integration-password"
          :ref="
            (instance) => {
              fieldRefs.password = instance;
            }
          "
          :error="fieldErrors.password"
          class="obs-integration-settings-block__password"
          :label="t('obs.password')"
          type="password"
          :model-value="password"
          :placeholder="hasStoredPassword ? t('obs.passwordPlaceholder') : ''"
          :maxlength="MAX_PASSWORD_LENGTH"
          autocomplete="off"
          :disabled="isSaving || isLoading || Boolean(readError)"
          @update:model-value="emit('update:password', $event)"
        >
          <template #action>
            <UiIconButton
              v-if="hasStoredPassword && isEnabled"
              :icon="Trash2"
              :label="t('obs.removePassword')"
              variant="ghost"
              :disabled="isSaving || isLoading || Boolean(readError)"
              intent="danger"
              @click="emit('clearPassword')"
            />
          </template>
        </UiTextField>

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
          :label="t('obs.skipThreshold')"
          :model-value="skipThresholdSeconds"
          :placeholder="DEFAULT_SKIP_THRESHOLD_SECONDS"
          class="obs-integration-settings-block__threshold"
          :hint="t('obs.skipThresholdHint')"
          :disabled="isSaving || isLoading || Boolean(readError)"
          @update:model-value="emit('update:skipThresholdSeconds', $event)"
        />

        <UiHint v-if="saveError" tone="danger" role="alert">{{
          saveError
        }}</UiHint>
        <UiButton
          class="settings-section__form-action"
          variant="accent"
          :loading="isSaving"
          :disabled="isLoading || Boolean(readError)"
          @click="emit('save', { enabled: true })"
        >
          {{
            t(
              !isEnabled
                ? 'obs.saveAndConnect'
                : canRetry
                  ? 'obs.saveAndReconnect'
                  : 'obs.save',
            )
          }}
        </UiButton>
      </div>
      <SettingsDocumentItem
        :title="t('obs.dock.title')"
        :guidance="t('obs.dock.guidance')"
        variant="nested"
      >
        <template #actions>
          <UiCheckbox
            id="obs-auto-arrangement-dock"
            :label="t('obs.dock.auto')"
            :model-value="dockPreference.value.value"
            :disabled="
              dockPreference.busy.value || dockPreference.reading.value
            "
            :error="dockPreference.error.value"
            @update:model-value="dockPreference.save"
          />
        </template>
        <template v-if="dockPreference.readError.value" #feedback>
          <UiButton variant="ghost" @click="dockPreference.refresh">{{
            t('obs.dock.reload')
          }}</UiButton>
        </template>
      </SettingsDocumentItem>
    </UiDisclosure>
  </div>
</template>

<style scoped>
.obs-integration-settings-block {
  min-inline-size: 0;
  display: grid;
}

.obs-integration-settings-block__connection {
  /* Host and port stay tightly paired (--ui-space-2) — they're one address,
     not two unrelated fields. */
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: var(--ui-space-2);
}

.obs-integration-settings-block__host {
  flex: 0 1 var(--settings-text-inline-size);
  min-inline-size: min(100%, 16ch);
  max-inline-size: 100%;
}

.obs-integration-settings-block__password {
  inline-size: var(--settings-long-text-inline-size);
  max-inline-size: 100%;
}

.obs-integration-settings-block__threshold {
  --ui-text-field-control-max-inline-size: var(--settings-number-inline-size);

  inline-size: var(--settings-text-inline-size);
  max-inline-size: 100%;
}
</style>

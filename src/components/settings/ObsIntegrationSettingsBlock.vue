<script setup>
import { computed, nextTick, shallowRef, watch } from 'vue';
import {
  Download,
  Play,
  Power,
  RefreshCw,
  Trash2,
  Video,
} from '../../icons/index.js';
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

const outputSummary = computed(() => {
  if (!CONNECTED_LIFECYCLES.includes(lifecycle.value)) {
    return t('obs.summaryIdle');
  }
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
      :icon="Video"
      :title="t('obs.title')"
      :value="outputSummary"
      :status="statusLabel"
      :status-tone="statusTone"
      :guidance="t('obs.guidance')"
      variant="nested"
    >
      <template #actions>
        <UiButton
          v-if="featureEnabled"
          id="obs-integration-enabled"
          :icon="isEnabled ? Power : Play"
          :variant="isEnabled ? 'secondary' : 'accent'"
          :aria-label="
            t(isEnabled ? 'obs.disconnectLabel' : 'obs.connectLabel')
          "
          :disabled="isSaving || isLoading || Boolean(readError)"
          @click="emit('save', { enabled: !isEnabled })"
          >{{ t(isEnabled ? 'obs.disconnect' : 'obs.connect') }}</UiButton
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
          >{{ t('obs.reloadStatus') }}</UiButton
        >
      </template>
    </SettingsDocumentItem>
    <UiHint v-if="readError" tone="danger" role="alert">{{ readError }}</UiHint>
    <UiButton
      v-if="readError"
      class="obs-integration-settings-block__read-retry"
      variant="ghost"
      :loading="isLoading"
      @click="emit('refreshSettings')"
      >{{ t('obs.reloadSettings') }}</UiButton
    >

    <div
      v-if="(!featureEnabled || !isEnabled) && hasStoredPassword"
      class="obs-integration-settings-block__stored-credential"
    >
      <span>{{ t('obs.passwordSaved') }}</span>
      <UiButton
        variant="ghost"
        :disabled="isSaving"
        intent="danger"
        @click="emit('clearPassword')"
      >
        {{ t('obs.removePassword') }}
      </UiButton>
    </div>

    <UiHint
      v-if="passwordError && (!featureEnabled || !isEnabled)"
      tone="danger"
      role="alert"
      >{{ passwordError }}</UiHint
    >

    <UiDisclosure
      v-if="featureEnabled"
      v-model:open="isConnectionSettingsOpen"
      class="settings-section__disclosure"
      :label="t('obs.settings')"
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
            class="obs-integration-settings-block__port"
            :label="t('obs.port')"
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
          :label="t('obs.skipThreshold')"
          :model-value="skipThresholdSeconds"
          placeholder="10"
          class="obs-integration-settings-block__threshold"
          :hint="t('obs.skipThresholdHint')"
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
      </div>
    </UiDisclosure>

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
          :disabled="dockPreference.busy.value || dockPreference.reading.value"
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
    <SettingsDocumentItem
      v-if="featureEnabled"
      :title="t('obs.markers.title')"
      :guidance="t('obs.markers.guidance')"
      variant="nested"
    >
      <template #actions>
        <UiIconButton
          :icon="Download"
          :label="t('obs.markers.export')"
          @click="emit('exportChapters')"
        />
      </template>
    </SettingsDocumentItem>

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
  flex-wrap: wrap;
  align-items: start;
  gap: var(--ui-space-2);
}

.obs-integration-settings-block__host {
  flex: 0 1 var(--settings-text-inline-size);
  min-inline-size: min(100%, 16ch);
  max-inline-size: 100%;
}

.obs-integration-settings-block__port {
  /* Fixed to what a 1-5 digit port number actually needs, not stretched to
     match the host field — equal-width columns for unequal content is the
     "monotonous grid" this replaces. */
  flex: 0 0 var(--settings-port-inline-size);
  max-inline-size: 100%;
}

.obs-integration-settings-block__credential {
  display: flex;
  align-items: start;
  gap: var(--ui-space-2);
}

.obs-integration-settings-block__password {
  flex: 0 1 var(--settings-long-text-inline-size);
  min-inline-size: min(100%, 20ch);
  max-inline-size: 100%;
}

.obs-integration-settings-block__threshold {
  inline-size: var(--settings-text-inline-size);
  max-inline-size: 100%;
}
.obs-integration-settings-block__threshold :deep(.ui-text-field__control-row) {
  max-inline-size: var(--settings-number-inline-size);
}

.obs-integration-settings-block__stored-credential {
  inline-size: var(--settings-long-text-inline-size);
  max-inline-size: 100%;
}
.obs-integration-settings-block__read-retry {
  justify-self: end;
}

.obs-integration-settings-block__submit {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>

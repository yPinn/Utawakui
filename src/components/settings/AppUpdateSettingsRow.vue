<script setup>
import { computed } from 'vue';
import { Download, RefreshCw } from '../../icons/index.js';
import { formatDownloadProgress } from '../../utils/appUpdateProgress.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  currentVersion: { type: String, default: '' },
  enabled: { type: Boolean, default: false },
  phase: {
    type: String,
    default: 'disabled',
    validator: (value) =>
      [
        'disabled',
        'idle',
        'checking',
        'available',
        'not-available',
        'downloading',
        'downloaded',
        'error',
      ].includes(value),
  },
  availableVersion: { type: String, default: null },
  progress: { type: Number, default: null },
  downloadBytesPerSecond: { type: Number, default: null },
  downloadEtaSeconds: { type: Number, default: null },
  error: { type: String, default: null },
  infoError: { type: String, default: '' },
  autoCheckEnabled: { type: Boolean, default: true },
  autoCheckBusy: { type: Boolean, default: false },
  autoCheckError: { type: String, default: '' },
  autoCheckReadError: { type: String, default: '' },
  autoCheckLoaded: { type: Boolean, default: true },
  autoCheckReading: { type: Boolean, default: false },
  statusReadError: { type: String, default: '' },
  actionError: { type: String, default: '' },
});

const emit = defineEmits([
  'check',
  'download',
  'install',
  'setAutoCheck',
  'refreshAutoCheck',
  'refreshStatus',
  'refreshInfo',
]);

const updatePresentation = computed(() => {
  switch (props.phase) {
    case 'idle':
      return {
        value: t('appUpdate.phase.idle'),
        status: t('appUpdate.status.idle'),
        tone: 'muted',
      };
    case 'checking':
      return {
        value: t('appUpdate.phase.checking'),
        status: t('appUpdate.status.checking'),
        tone: 'info',
      };
    case 'available':
      return {
        value: props.availableVersion
          ? t('appUpdate.phase.availableVersion', {
              version: props.availableVersion,
            })
          : t('appUpdate.phase.availableUnknown'),
        status: t('appUpdate.status.available'),
        tone: 'warning',
      };
    case 'not-available':
      return {
        value: t('appUpdate.phase.latest'),
        status: t('appUpdate.status.latest'),
        tone: 'success',
      };
    case 'downloading':
      return {
        value: formatDownloadProgress({
          progress: props.progress,
          downloadBytesPerSecond: props.downloadBytesPerSecond,
          downloadEtaSeconds: props.downloadEtaSeconds,
        }),
        status: t('appUpdate.status.downloading'),
        tone: 'info',
      };
    case 'downloaded':
      return {
        value: props.availableVersion
          ? t('appUpdate.phase.downloadedVersion', {
              version: props.availableVersion,
            })
          : t('appUpdate.phase.downloadedUnknown'),
        status: t('appUpdate.status.installable'),
        tone: 'success',
      };
    case 'error':
      return {
        value: props.error || t('appUpdate.phase.failed'),
        status: t('appUpdate.status.retry'),
        tone: 'warning',
      };
    default:
      return {
        value: t('appUpdate.phase.unsupported'),
        status: t('appUpdate.status.packagedOnly'),
        tone: 'muted',
      };
  }
});

const rowPresentation = computed(() => {
  if (props.statusReadError)
    return {
      value: props.statusReadError,
      status: t('appUpdate.status.unreadable'),
      tone: 'warning',
    };
  if (!props.currentVersion) {
    return {
      value: props.infoError
        ? t('appUpdate.phase.infoUnavailable')
        : t('settings.reading'),
      status: props.infoError
        ? t('appUpdate.status.unreadable')
        : t('settings.reading'),
      tone: props.infoError ? 'warning' : 'muted',
    };
  }

  return {
    value: t('appUpdate.currentWithStatus', {
      version: props.currentVersion,
      status: updatePresentation.value.value,
    }),
    status: updatePresentation.value.status,
    tone: updatePresentation.value.tone,
  };
});

const action = computed(() => {
  if (!props.enabled) return 'check';
  if (
    props.phase === 'available' ||
    (props.phase === 'error' && props.availableVersion)
  ) {
    return 'download';
  }
  if (props.phase === 'downloaded') return 'install';
  if (['checking', 'downloading'].includes(props.phase)) return null;
  return 'check';
});

const actionDisabled = computed(() => !props.enabled);

const actionLabel = computed(() => {
  if (action.value === 'download') return t('appUpdate.action.download');
  if (action.value === 'install') return t('appUpdate.action.install');
  return t('appUpdate.action.check');
});

const actionTitle = computed(() => {
  if (actionDisabled.value) return t('appUpdate.action.packagedOnly');
  if (action.value === 'download') return t('appUpdate.action.downloadTitle');
  if (action.value === 'install') return t('appUpdate.action.installTitle');
  return t('appUpdate.action.checkTitle');
});

function handleAction() {
  if (!actionDisabled.value && action.value) emit(action.value);
}
</script>

<template>
  <div class="app-update-settings-row">
    <SettingsDocumentItem
      :icon="RefreshCw"
      :title="t('appUpdate.title')"
      :value="rowPresentation.value"
      :status="rowPresentation.status"
      :status-tone="rowPresentation.tone"
      :description="t('appUpdate.description')"
      :guidance="infoError"
    >
      <template #actions>
        <UiCheckbox
          id="app-update-auto-check"
          :label="t('appUpdate.autoCheck')"
          :aria-label="t('appUpdate.autoCheckLabel')"
          :model-value="autoCheckLoaded && autoCheckEnabled"
          :error="autoCheckError"
          :disabled="
            !enabled || autoCheckBusy || autoCheckReading || !autoCheckLoaded
          "
          @update:model-value="emit('setAutoCheck', $event)"
        />
        <template v-if="action">
          <UiIconButton
            v-if="action !== 'install'"
            :icon="action === 'download' ? Download : RefreshCw"
            :label="actionLabel"
            :disabled="actionDisabled"
            :title="actionTitle"
            @click="handleAction"
          />
          <UiButton
            v-else
            :icon="RefreshCw"
            variant="accent"
            :disabled="actionDisabled"
            :title="actionTitle"
            @click="handleAction"
          >
            {{ actionLabel }}
          </UiButton>
        </template>
      </template>
      <template
        v-if="
          infoError ||
          autoCheckReadError ||
          !autoCheckLoaded ||
          statusReadError ||
          (actionError && phase !== 'error')
        "
        #feedback
      >
        <UiButton
          v-if="infoError"
          variant="ghost"
          @click="emit('refreshInfo')"
          >{{ t('appUpdate.reloadInfo') }}</UiButton
        >
        <UiHint
          v-if="autoCheckReadError || !autoCheckLoaded"
          :tone="autoCheckReadError ? 'danger' : 'muted'"
          role="status"
          >{{
            autoCheckReadError || t('appUpdate.autoCheckUnconfirmed')
          }}</UiHint
        >
        <UiButton
          v-if="autoCheckReadError"
          variant="ghost"
          :loading="autoCheckReading"
          @click="emit('refreshAutoCheck')"
          >{{ t('appUpdate.reloadAutoCheck') }}</UiButton
        >
        <UiButton
          v-if="statusReadError"
          variant="ghost"
          @click="emit('refreshStatus')"
          >{{ t('appUpdate.reloadStatus') }}</UiButton
        >
        <UiHint
          v-if="actionError && phase !== 'error'"
          tone="danger"
          role="alert"
          >{{ actionError }}</UiHint
        >
      </template>
    </SettingsDocumentItem>
  </div>
</template>

<style scoped>
.app-update-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}
</style>

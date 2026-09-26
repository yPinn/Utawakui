<script setup>
import { computed } from 'vue';
import { Download, RefreshCw } from '../../icons/index.js';
import { formatDownloadProgress } from '../../utils/appUpdateProgress.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsActionRow from './SettingsActionRow.vue';

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
});

const emit = defineEmits(['check', 'download', 'install', 'setAutoCheck']);

const availableVersionLabel = computed(() =>
  props.availableVersion ? `v${props.availableVersion}` : '新版本',
);

const updatePresentation = computed(() => {
  switch (props.phase) {
    case 'idle':
      return { value: '可檢查是否有新版本', status: '待命', tone: 'muted' };
    case 'checking':
      return { value: '正在檢查公開發行版本', status: '檢查中', tone: 'info' };
    case 'available':
      return {
        value: `可下載 ${availableVersionLabel.value}`,
        status: '有更新',
        tone: 'warning',
      };
    case 'not-available':
      return { value: '目前已是最新版本', status: '最新', tone: 'success' };
    case 'downloading':
      return {
        value: formatDownloadProgress({
          progress: props.progress,
          downloadBytesPerSecond: props.downloadBytesPerSecond,
          downloadEtaSeconds: props.downloadEtaSeconds,
        }),
        status: '下載中',
        tone: 'info',
      };
    case 'downloaded':
      return {
        value: `${availableVersionLabel.value} 已準備完成`,
        status: '待重新啟動',
        tone: 'success',
      };
    case 'error':
      return {
        value: props.error || '更新操作未完成',
        status: '需重試',
        tone: 'warning',
      };
    default:
      return {
        value: '開發版不支援自動更新',
        status: '僅正式版',
        tone: 'muted',
      };
  }
});

const rowPresentation = computed(() => {
  if (!props.currentVersion) {
    return {
      value: props.infoError ? '版本資訊無法取得' : '讀取中',
      status: props.infoError ? '無法讀取' : '讀取中',
      tone: props.infoError ? 'warning' : 'muted',
    };
  }

  return {
    value: `v${props.currentVersion} · ${updatePresentation.value.value}`,
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
  if (action.value === 'download') return '下載';
  if (action.value === 'install') return '重新啟動並安裝';
  return '檢查更新';
});

const actionTitle = computed(() =>
  actionDisabled.value ? '正式安裝版才可使用' : `${actionLabel.value} Utawakui`,
);

function handleAction() {
  if (!actionDisabled.value && action.value) emit(action.value);
}
</script>

<template>
  <div class="app-update-settings-row">
    <SettingsActionRow
      :icon="RefreshCw"
      title="Utawakui 版本"
      description="啟動後只檢查版本；下載與安裝仍由你決定。"
      :value="rowPresentation.value"
      :status="rowPresentation.status"
      :status-tone="rowPresentation.tone"
      :tooltip="infoError || '顯示目前安裝版本與公開發行版本的更新狀態。'"
    >
      <template #actions>
        <UiCheckbox
          id="app-update-auto-check"
          label="自動檢查"
          aria-label="啟動與定期自動檢查是否有新版本"
          :model-value="autoCheckEnabled"
          :disabled="!enabled || autoCheckBusy"
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
    </SettingsActionRow>

    <UiNotice
      v-if="autoCheckError"
      tone="danger"
      title="自動檢查更新設定未儲存"
      :message="autoCheckError"
      compact
    />
  </div>
</template>

<style scoped>
.app-update-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}
</style>

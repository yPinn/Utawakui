<script setup>
import { computed } from 'vue';
import { Cpu, Download, Trash2, Wrench } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsActionRow from './SettingsActionRow.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';

const props = defineProps({
  capability: { type: Object, default: null },
  autoAnalyze: { type: Boolean, default: true },
  capabilityBusy: { type: Boolean, default: false },
  preferenceBusy: { type: Boolean, default: false },
  stageLabel: { type: String, default: '' },
  capabilityError: { type: String, default: '' },
  preferenceError: { type: String, default: '' },
});

const emit = defineEmits(['setAutoAnalyze', 'prepare', 'repair', 'remove']);

const installed = computed(() => props.capability?.installed === true);
const damaged = computed(() => props.capability?.status === 'damaged');
const status = computed(() => {
  if (props.capabilityBusy) return props.stageLabel || '準備中';
  if (props.capability?.status === 'ready') return '可使用';
  if (damaged.value) return '需要修復';
  if (props.capability?.status === 'missing') return '未準備';
  return '無法讀取';
});
const statusTone = computed(() => {
  if (props.capabilityBusy) return 'info';
  if (props.capability?.status === 'ready') return 'success';
  return 'warning';
});

const actionItem = computed(() => {
  const canPrepare = props.capability?.canPrepare === true;
  const canRepair = props.capability?.canRepair === true;
  const canRemove = props.capability?.canRemove === true;
  const primaryAction = damaged.value
    ? canRepair
      ? { icon: Wrench, label: '修復 BPM 分析' }
      : null
    : !installed.value && canPrepare
      ? { icon: Download, label: '準備 BPM 分析' }
      : null;
  const advancedActions = [
    ...(!damaged.value && installed.value && canRepair
      ? [{ id: 'repair', icon: Wrench, label: '修復' }]
      : []),
    ...(installed.value && canRemove
      ? [{ id: 'remove', icon: Trash2, label: '移除', danger: true }]
      : []),
  ].map((action) => ({ ...action, disabled: props.capabilityBusy }));

  return {
    id: 'music-analysis',
    title: 'BPM 分析',
    actionIcon: primaryAction?.icon ?? null,
    actionLabel: primaryAction?.label ?? '',
    actionDisabled: props.capabilityBusy,
    advancedActions,
  };
});
const hasManagementActions = computed(
  () =>
    Boolean(actionItem.value.actionIcon) ||
    actionItem.value.advancedActions.length > 0,
);

function handlePrimaryAction() {
  emit(damaged.value ? 'repair' : 'prepare');
}

function handleAdvancedAction({ action }) {
  if (action === 'repair' || action === 'remove') emit(action);
}
</script>

<template>
  <div class="music-analysis-settings-row">
    <SettingsActionRow
      :icon="Cpu"
      title="BPM 分析"
      value="產生 BPM 與節拍資料"
      :status="status"
      :status-tone="statusTone"
      tooltip="本機 BPM／節拍；歌曲不會上傳。"
      variant="subtle"
    >
      <template #actions>
        <UiCheckbox
          id="auto-music-analysis"
          label="自動分析"
          aria-label="匯入歌曲後自動分析 BPM 與節拍"
          :model-value="autoAnalyze"
          :disabled="preferenceBusy"
          @update:model-value="emit('setAutoAnalyze', $event)"
        />
        <SettingsDependencyActions
          v-if="hasManagementActions"
          :item="actionItem"
          @primary-action="handlePrimaryAction"
          @advanced-action="handleAdvancedAction"
        />
      </template>
    </SettingsActionRow>

    <UiNotice
      v-if="capabilityError"
      tone="danger"
      title="BPM 分析元件無法使用"
      :message="capabilityError"
      compact
    />
    <UiNotice
      v-if="preferenceError"
      tone="danger"
      title="自動分析設定未儲存"
      :message="preferenceError"
      compact
    />
  </div>
</template>

<style scoped>
.music-analysis-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}
</style>

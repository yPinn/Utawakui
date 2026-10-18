<script setup>
import { computed } from 'vue';
import { Cpu, Download, Trash2, Wrench } from '../../icons/index.js';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';

const props = defineProps({
  capability: { type: Object, default: null },
  capabilityBusy: { type: Boolean, default: false },
  stageLabel: { type: String, default: '' },
  progressPercent: { type: Number, default: null },
  capabilityError: { type: String, default: '' },
  capabilityReadError: { type: String, default: '' },
});

const emit = defineEmits(['prepare', 'repair', 'remove', 'refreshCapability']);

const installed = computed(() => props.capability?.installed === true);
const damaged = computed(() => props.capability?.status === 'damaged');
const status = computed(() => {
  if (props.capabilityReadError) return '無法讀取';
  if (props.capabilityBusy)
    return `${props.stageLabel || '準備中'}${Number.isFinite(props.progressPercent) ? ` ${Math.round(props.progressPercent)}%` : ''}`;
  if (props.capability?.status === 'ready') return '可使用';
  if (damaged.value) return '需要修復';
  if (props.capability?.status === 'missing') return '未準備';
  return '無法讀取';
});
const statusTone = computed(() => {
  if (props.capabilityReadError) return 'warning';
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
      ? [{ id: 'remove', icon: Trash2, label: '移除', intent: 'danger' }]
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
    <SettingsDocumentItem
      :icon="Cpu"
      title="BPM 分析元件"
      :status="status"
      :status-tone="statusTone"
      variant="nested"
    >
      <template #actions>
        <SettingsDependencyActions
          v-if="hasManagementActions"
          :item="actionItem"
          @primary-action="handlePrimaryAction"
          @advanced-action="handleAdvancedAction"
        />
      </template>
      <template v-if="capabilityError || capabilityReadError" #feedback>
        <UiHint v-if="capabilityError" tone="danger" role="alert">{{
          capabilityError
        }}</UiHint>
        <UiHint v-if="capabilityReadError" tone="danger" role="alert">{{
          capabilityReadError
        }}</UiHint>
        <UiButton
          v-if="capabilityReadError"
          variant="ghost"
          :disabled="capabilityBusy"
          @click="emit('refreshCapability')"
          >重新讀取 BPM 狀態</UiButton
        >
      </template>
    </SettingsDocumentItem>
  </div>
</template>

<style scoped>
.music-analysis-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}
</style>

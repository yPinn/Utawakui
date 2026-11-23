<script setup>
import { computed } from 'vue';
import { Download, Trash2, Wrench } from '../../icons/index.js';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  capability: { type: Object, default: null },
  capabilityBusy: { type: Boolean, default: false },
  stageLabel: { type: String, default: '' },
  progressPercent: { type: Number, default: null },
  capabilityError: { type: String, default: '' },
  capabilityReadError: { type: String, default: '' },
  preference: { type: Object, required: true },
});

const emit = defineEmits([
  'prepare',
  'repair',
  'remove',
  'refreshCapability',
  'refreshPreference',
  'setAutoAnalyze',
]);

const installed = computed(() => props.capability?.installed === true);
const damaged = computed(() => props.capability?.status === 'damaged');
const status = computed(() => {
  if (props.capabilityReadError) return t('capabilities.bpm.unreadable');
  if (props.capabilityBusy)
    return Number.isFinite(props.progressPercent)
      ? t('capabilities.bpm.progressNamed', {
          stage: props.stageLabel || t('capabilities.bpm.preparing'),
          percent: Math.round(props.progressPercent),
        })
      : props.stageLabel || t('capabilities.bpm.preparing');
  if (props.capability?.status === 'ready')
    return t('capabilities.bpm.available');
  if (damaged.value) return t('capabilities.bpm.needsRepair');
  if (props.capability?.status === 'missing')
    return t('capabilities.bpm.missing');
  return t('capabilities.bpm.unreadable');
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
      ? { icon: Wrench, label: t('capabilities.bpm.repairNamed') }
      : null
    : !installed.value && canPrepare
      ? { icon: Download, label: t('capabilities.bpm.prepareNamed') }
      : null;
  const advancedActions = [
    ...(!damaged.value && installed.value && canRepair
      ? [{ id: 'repair', icon: Wrench, label: t('capabilities.bpm.repair') }]
      : []),
    ...(installed.value && canRemove
      ? [
          {
            id: 'remove',
            icon: Trash2,
            label: t('capabilities.bpm.remove'),
            intent: 'danger',
          },
        ]
      : []),
  ].map((action) => ({ ...action, disabled: props.capabilityBusy }));

  return {
    id: 'music-analysis',
    title: t('capabilities.bpm.name'),
    actionIcon: primaryAction?.icon ?? null,
    actionLabel: primaryAction?.label ?? '',
    actionDisabled: props.capabilityBusy,
    advancedActions,
  };
});
function handlePrimaryAction() {
  emit(damaged.value ? 'repair' : 'prepare');
}

function handleAdvancedAction({ action }) {
  if (action === 'repair' || action === 'remove') emit(action);
}
</script>

<template>
  <SettingsDocumentItem
    :title="t('capabilities.bpm.name')"
    :guidance="t('capabilities.bpm.guidance')"
    :status="status"
    :status-tone="statusTone"
    variant="nested"
    title-tag="h3"
    status-live
  >
    <template #actions>
      <UiCheckbox
        id="auto-music-analysis"
        :label="t('capabilities.bpm.auto')"
        :aria-label="t('capabilities.bpm.autoLabel')"
        :model-value="preference.loaded && preference.autoAnalyze"
        :disabled="preference.busy || preference.reading || !preference.loaded"
        :error="preference.error"
        @update:model-value="emit('setAutoAnalyze', $event)"
      />
      <SettingsDependencyActions
        :item="actionItem"
        @primary-action="handlePrimaryAction"
        @advanced-action="handleAdvancedAction"
      />
    </template>
    <template
      v-if="
        capabilityError ||
        capabilityReadError ||
        preference.readError ||
        !preference.loaded
      "
      #feedback
    >
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
        >{{ t('capabilities.bpm.reloadStatus') }}</UiButton
      >
      <UiHint
        v-if="preference.readError || !preference.loaded"
        :tone="preference.readError ? 'danger' : 'muted'"
        role="status"
      >
        {{ preference.readError || t('capabilities.unconfirmed') }}
      </UiHint>
      <UiButton
        v-if="preference.readError"
        variant="ghost"
        :loading="preference.reading"
        @click="emit('refreshPreference')"
      >
        {{ t('capabilities.bpm.reloadPreference') }}
      </UiButton>
    </template>
  </SettingsDocumentItem>
</template>

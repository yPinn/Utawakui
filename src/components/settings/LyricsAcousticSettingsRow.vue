<script setup>
import { computed } from 'vue';
import { Download, Trash2, Wrench } from '../../icons/index.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  capability: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  operation: { type: String, default: '' },
  error: { type: String, default: '' },
});
const emit = defineEmits([
  'prepare',
  'verify',
  'repair',
  'remove',
  'cancel',
  'refresh',
]);
const busy = computed(() => props.busy || props.capability?.busy === true);
const status = computed(
  () =>
    ({
      blocked: t('lyricsResearch.acoustic.status.blocked'),
      missing: t('lyricsResearch.acoustic.status.missing'),
      ready: t('lyricsResearch.acoustic.status.ready'),
      unverified: t('lyricsResearch.acoustic.status.unverified'),
      damaged: t('lyricsResearch.acoustic.status.damaged'),
      'remove-pending': t('lyricsResearch.acoustic.status.removePending'),
      preparing: t('lyricsResearch.acoustic.status.preparing'),
      verifying: t('lyricsResearch.acoustic.status.verifying'),
      removing: t('lyricsResearch.acoustic.status.removing'),
    })[props.capability?.status] ?? t('lyricsResearch.acoustic.status.unknown'),
);
const actions = computed(() => ({
  id: 'lyrics-acoustic',
  title: t('lyricsResearch.acoustic.title'),
  actionIcon: props.capability?.canPrepare ? Download : null,
  actionLabel: t('lyricsResearch.acoustic.prepare'),
  actionDisabled: busy.value,
  advancedActions: [
    ...(props.capability?.canRepair
      ? [
          {
            id: 'repair',
            label: t('lyricsResearch.acoustic.repair'),
            icon: Wrench,
          },
        ]
      : []),
    ...(props.capability?.canRemove
      ? [
          {
            id: 'remove',
            label: t('lyricsResearch.acoustic.remove'),
            icon: Trash2,
            intent: 'danger',
          },
        ]
      : []),
  ].map((item) => ({ ...item, disabled: busy.value })),
}));
function advanced({ action }) {
  if (action === 'repair' || action === 'remove') emit(action);
}
</script>

<template>
  <SettingsDocumentItem
    :title="t('lyricsResearch.acoustic.itemTitle')"
    :description="t('lyricsResearch.acoustic.description')"
    :status="busy ? t('lyricsResearch.acoustic.busy') : status"
    :status-tone="capability?.status === 'ready' ? 'success' : 'muted'"
    variant="nested"
  >
    <template #actions>
      <UiButton
        v-if="capability?.canVerify && !busy"
        variant="accent"
        :disabled="busy"
        @click="emit('verify')"
        >{{ t('lyricsResearch.acoustic.verify') }}</UiButton
      >
      <UiButton
        v-if="
          busy && operation !== 'remove' && capability?.status !== 'removing'
        "
        variant="secondary"
        @click="emit('cancel')"
        >{{ t('lyricsResearch.acoustic.cancel') }}</UiButton
      >
      <SettingsDependencyActions
        v-if="actions.actionIcon || actions.advancedActions.length"
        :item="actions"
        @primary-action="emit('prepare')"
        @advanced-action="advanced"
      />
    </template>
    <template #feedback>
      <UiHint v-if="capability?.status === 'remove-pending'">{{
        t('lyricsResearch.acoustic.removePendingHint')
      }}</UiHint>
      <UiHint v-if="capability?.status === 'blocked'">{{
        t('lyricsResearch.acoustic.blockedNotice')
      }}</UiHint>
      <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
      <UiButton
        v-if="error || !capability || capability.status === 'unavailable'"
        variant="ghost"
        :disabled="busy"
        @click="emit('refresh')"
        >{{ t('lyricsResearch.acoustic.refresh') }}</UiButton
      >
    </template>
  </SettingsDocumentItem>
</template>

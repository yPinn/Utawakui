<script setup>
import { computed } from 'vue';
import { Check, Download, Trash2, Wrench } from '../../icons/index.js';
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
const canVerify = computed(() => props.capability?.canVerify && !busy.value);
const actions = computed(() => ({
  id: 'lyrics-acoustic',
  title: t('lyricsResearch.acoustic.title'),
  actionIcon: canVerify.value
    ? Check
    : props.capability?.canPrepare
      ? Download
      : null,
  actionLabel: t(
    canVerify.value
      ? 'lyricsResearch.acoustic.verify'
      : 'lyricsResearch.acoustic.prepare',
  ),
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
function primary() {
  if (busy.value) return;
  if (canVerify.value) emit('verify');
  else if (props.capability?.canPrepare) emit('prepare');
}
function advanced({ action }) {
  if (action === 'repair' || action === 'remove') emit(action);
}
</script>

<template>
  <SettingsDocumentItem
    :title="t('lyricsResearch.acoustic.itemTitle')"
    :status="busy ? t('lyricsResearch.acoustic.busy') : status"
    :status-tone="capability?.status === 'ready' ? 'success' : 'muted'"
    variant="nested"
    title-tag="h3"
  >
    <template #actions>
      <UiButton
        v-if="
          busy && operation !== 'remove' && capability?.status !== 'removing'
        "
        variant="secondary"
        @click="emit('cancel')"
        >{{ t('lyricsResearch.acoustic.cancel') }}</UiButton
      >
      <SettingsDependencyActions
        :item="actions"
        @primary-action="primary"
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

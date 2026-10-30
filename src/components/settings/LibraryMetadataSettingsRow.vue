<script setup>
import { computed } from 'vue';
import { ListChecks, RefreshCw } from '../../icons/index.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import { useLibraryMetadataMaintenance } from '../../composables/useLibraryMetadataMaintenance.js';
import { useLibraryReconciliation } from '../../composables/useLibraryReconciliation.js';
import LibraryReconciliationModal from './LibraryReconciliationModal.vue';
import { t } from '../../utils/i18n.js';

const { state, feedback, refresh, cancel, reload } =
  useLibraryMetadataMaintenance();
const reconciliation = useLibraryReconciliation();
const busy = computed(() => state.busy || reconciliation.state.busy);
const managementItem = computed(() => ({
  title: t('librarySettings.metadata.title'),
  advancedActions: [
    {
      id: 'reconcile',
      label: t('librarySettings.metadata.reconcile'),
      icon: ListChecks,
    },
    {
      id: 'reload',
      label: t('librarySettings.metadata.reloadLocal'),
      icon: RefreshCw,
    },
  ].map((action) => ({ ...action, disabled: busy.value })),
}));
function manage({ action }) {
  if (busy.value) return;
  if (action === 'reconcile') reconciliation.open();
  else if (action === 'reload') reload();
}
</script>

<template>
  <SettingsDocumentItem
    :icon="RefreshCw"
    :title="t('librarySettings.metadata.title')"
    :guidance="t('librarySettings.metadata.guidance')"
  >
    <template #actions>
      <UiButton
        v-if="state.busy && state.progress?.status === 'running'"
        variant="secondary"
        :disabled="state.cancelling"
        @click="cancel"
        >{{ t('librarySettings.metadata.stop') }}</UiButton
      >
      <UiButton
        v-else
        :icon="RefreshCw"
        variant="accent"
        :disabled="busy"
        :loading="state.busy"
        :loading-label="t('librarySettings.metadata.updating')"
        :title="t('librarySettings.metadata.fillHint')"
        :aria-description="t('librarySettings.metadata.fillHint')"
        @click="refresh"
        >{{ t('librarySettings.metadata.fill') }}</UiButton
      >
      <SettingsDependencyActions
        :item="managementItem"
        @advanced-action="manage"
      />
    </template>
    <template v-if="feedback" #feedback>
      <UiHint
        :tone="state.error ? 'danger' : 'muted'"
        :role="state.error ? 'alert' : 'status'"
        >{{ feedback }}</UiHint
      >
    </template>
  </SettingsDocumentItem>
  <LibraryReconciliationModal />
</template>

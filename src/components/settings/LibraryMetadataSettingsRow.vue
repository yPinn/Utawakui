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

const { state, feedback, refresh, cancel, reload } =
  useLibraryMetadataMaintenance();
const reconciliation = useLibraryReconciliation();
const busy = computed(() => state.busy || reconciliation.state.busy);
const managementItem = computed(() => ({
  title: '曲庫資訊',
  advancedActions: [
    { id: 'reconcile', label: '校對曲庫資訊', icon: ListChecks },
    { id: 'reload', label: '重新讀取本機資料', icon: RefreshCw },
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
    title="曲庫資訊"
    guidance="啟動時整理本機資料；線上補齊專輯與曲序，保留手動編輯。"
  >
    <template #actions>
      <UiButton
        v-if="state.busy && state.progress?.status === 'running'"
        variant="secondary"
        :disabled="state.cancelling"
        @click="cancel"
        >停止</UiButton
      >
      <UiButton
        v-else
        :icon="RefreshCw"
        variant="accent"
        :disabled="busy"
        :loading="state.busy"
        loading-label="更新中"
        title="連線補齊所屬專輯與完整曲序，保留手動編輯。"
        aria-description="連線補齊所屬專輯與完整曲序，保留手動編輯。"
        @click="refresh"
        >線上補齊</UiButton
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

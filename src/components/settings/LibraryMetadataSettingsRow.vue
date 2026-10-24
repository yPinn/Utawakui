<script setup>
import { RefreshCw } from '../../icons/index.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import { useLibraryMetadataMaintenance } from '../../composables/useLibraryMetadataMaintenance.js';
import { useLibraryReconciliation } from '../../composables/useLibraryReconciliation.js';
import LibraryReconciliationModal from './LibraryReconciliationModal.vue';

const { state, feedback, refresh, cancel, reload } =
  useLibraryMetadataMaintenance();
const reconciliation = useLibraryReconciliation();
</script>

<template>
  <SettingsDocumentItem
    :icon="RefreshCw"
    title="曲庫資訊"
    status="自動"
    status-tone="success"
    guidance="啟動時整理本地資料；手動編輯會保留。"
  >
    <template #actions>
      <UiButton
        :disabled="state.busy || reconciliation.state.busy"
        title="檢查重複發行、音檔與資訊差異，逐欄校對後儲存。"
        aria-description="檢查重複發行、音檔與資訊差異，逐欄校對後儲存。"
        @click="reconciliation.open"
        >校對</UiButton
      >
      <UiButton
        :disabled="state.busy"
        title="重新讀取本地曲目與作品，不連線。"
        aria-description="重新讀取本地曲目與作品，不連線。"
        @click="reload"
        >重新讀取</UiButton
      >
      <UiButton
        :icon="RefreshCw"
        variant="secondary"
        :loading="state.busy"
        loading-label="更新中"
        title="連線補齊所屬專輯與完整曲序，保留手動編輯。"
        aria-description="連線補齊所屬專輯與完整曲序，保留手動編輯。"
        @click="refresh"
        >線上補齊</UiButton
      >
      <UiButton
        v-if="state.busy && state.progress?.status === 'running'"
        :disabled="state.cancelling"
        @click="cancel"
        >停止</UiButton
      >
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

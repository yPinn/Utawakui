<script setup>
import { computed } from 'vue';
import { Download, Trash2, Wrench } from '../../icons/index.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';

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
      blocked: '尚未開放準備',
      missing: '未準備',
      ready: '環境可用',
      unverified: '待驗證載入',
      damaged: '需要修復',
      'remove-pending': '移除尚未完成',
      preparing: '準備中',
      verifying: '驗證載入中',
      removing: '移除中',
    })[props.capability?.status] ?? '無法讀取',
);
const actions = computed(() => ({
  id: 'lyrics-acoustic',
  title: '歌詞音訊輔助',
  actionIcon: props.capability?.canPrepare ? Download : null,
  actionLabel: '準備歌詞音訊輔助環境',
  actionDisabled: busy.value,
  advancedActions: [
    ...(props.capability?.canRepair
      ? [{ id: 'repair', label: '修復', icon: Wrench }]
      : []),
    ...(props.capability?.canRemove
      ? [{ id: 'remove', label: '移除', icon: Trash2, intent: 'danger' }]
      : []),
  ].map((item) => ({ ...item, disabled: busy.value })),
}));
function advanced({ action }) {
  if (action === 'repair' || action === 'remove') emit(action);
}
</script>

<template>
  <SettingsDocumentItem
    title="歌詞音訊輔助元件"
    description="管理中文、日文詞塊分析所需元件。"
    :status="busy ? '環境操作中' : status"
    :status-tone="capability?.status === 'ready' ? 'success' : 'muted'"
    variant="nested"
  >
    <template #actions>
      <UiButton
        v-if="capability?.canVerify"
        variant="secondary"
        :disabled="busy"
        @click="emit('verify')"
        >驗證載入</UiButton
      >
      <UiButton
        v-if="
          busy && operation !== 'remove' && capability?.status !== 'removing'
        "
        variant="secondary"
        @click="emit('cancel')"
        >取消操作</UiButton
      >
      <SettingsDependencyActions
        v-if="actions.actionIcon || actions.advancedActions.length"
        :item="actions"
        @primary-action="emit('prepare')"
        @advanced-action="advanced"
      />
    </template>
    <template #feedback>
      <UiHint v-if="capability?.status === 'remove-pending'"
        >上次移除未完成，請再次移除以清理剩餘元件。原有歌詞仍可使用。</UiHint
      >
      <UiHint v-if="capability?.status === 'blocked'"
        >模型使用與分發資料確認中，暫不提供下載。原有歌詞仍可使用。</UiHint
      >
      <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
      <UiButton
        v-if="error || !capability || capability.status === 'unavailable'"
        variant="ghost"
        :disabled="busy"
        @click="emit('refresh')"
        >重新讀取環境狀態</UiButton
      >
    </template>
  </SettingsDocumentItem>
</template>

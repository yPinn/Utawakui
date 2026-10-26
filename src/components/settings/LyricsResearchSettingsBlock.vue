<script setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { useLyricsResearch } from '../../composables/lyrics/useLyricsResearch.js';
import {
  Captions,
  RefreshCw,
  Trash2,
  Wrench,
  Check,
} from '../../icons/index.js';
import SettingsSection from './SettingsSection.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import LyricsExperimentalQueueSettings from './LyricsExperimentalQueueSettings.vue';
import LyricsResearchPreviewTools from './LyricsResearchPreviewTools.vue';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';

const research = useLyricsResearch();
const toolsOpen = shallowRef(false);
let timer;
const status = computed(() => research.status.value?.status);
const statusLabel = computed(() => {
  if (research.busy.value) {
    const stage = research.status.value?.stage ?? '';
    if (stage.startsWith('download:')) return '下載工具中';
    return (
      {
        prepare: '準備中',
        verify: '檢查工具中',
        extract: '解壓縮中',
        preview: '等待分析',
        analyze: '分析歌詞中',
        hubertfa: '分析分段時間中',
        small: '檢查歌詞內容中',
        remove: '移除中',
      }[stage] || '處理中'
    );
  }
  return (
    {
      missing: '未下載',
      unverified: '待檢查',
      ready: '可使用',
      damaged: '需要修復',
    }[status.value] || '尚未讀取'
  );
});
const statusTone = computed(() =>
  research.busy.value
    ? 'info'
    : status.value === 'ready'
      ? 'success'
      : status.value === 'damaged'
        ? 'warning'
        : 'muted',
);
const primary = computed(
  () =>
    ({
      missing: { label: '下載工具', action: 'prepare' },
      unverified: { label: '檢查工具', action: 'verify' },
      damaged: { label: '重新下載修復', action: 'prepare' },
    })[status.value],
);
const installed = computed(() =>
  Boolean(status.value && status.value !== 'missing'),
);
const managementItem = computed(() => ({
  title: '歌詞分析工具',
  advancedActions: [
    { id: 'refresh', label: '重新讀取', icon: RefreshCw },
    ...(status.value === 'ready'
      ? [{ id: 'verify', label: '檢查工具', icon: Check }]
      : []),
    ...(installed.value && status.value !== 'damaged'
      ? [{ id: 'prepare', label: '重新下載修復', icon: Wrench }]
      : []),
    ...(installed.value
      ? [{ id: 'remove', label: '移除工具', icon: Trash2, intent: 'danger' }]
      : []),
  ].map((action) => ({ ...action, disabled: research.busy.value })),
}));
function manage({ action }) {
  if (research.busy.value) return;
  if (!managementItem.value.advancedActions.some((item) => item.id === action))
    return;
  if (action === 'refresh') void research.refresh();
  else void research.action(action);
}
onMounted(() => {
  void research.refresh();
  // Automatic work may change readiness while management is closed.
  timer = setInterval(() => void research.refresh(), 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <SettingsSection title="歌詞時間分析（實驗）">
    <UiHint class="lyrics-settings__notice">
      僅供本機研究試用。時間精度尚待人工驗證；模型權重及字典之使用與散布授權範圍尚待釐清。
    </UiHint>
    <SettingsDocumentItem
      :icon="Captions"
      title="歌詞分析工具"
      description="估算中、日、英文歌詞分段時間；需使用 Utawakui 管理的音訊轉換工具。"
      :guidance="
        status === 'ready'
          ? ''
          : '下載約 0.78 GB，安裝約 1.00 GB；建議預留 4 GB 空間。'
      "
      :status="statusLabel"
      :status-tone="statusTone"
      status-live
    >
      <template #actions>
        <UiButton
          v-if="primary && !research.busy.value"
          variant="accent"
          @click="research.action(primary.action)"
          >{{ primary.label }}</UiButton
        >
        <UiButton
          v-else-if="!status"
          variant="ghost"
          :disabled="research.busy.value"
          @click="research.refresh"
          >重新讀取</UiButton
        >
        <UiButton
          v-if="research.busy.value"
          variant="secondary"
          aria-label="取消操作並等待清理"
          @click="research.cancel"
          >取消</UiButton
        >
        <SettingsDependencyActions
          :item="managementItem"
          @advanced-action="manage"
        />
      </template>
      <template v-if="research.error.value" #feedback>
        <UiHint tone="danger" role="alert">{{ research.error.value }}</UiHint>
      </template>
    </SettingsDocumentItem>

    <LyricsExperimentalQueueSettings />

    <UiDisclosure
      v-model:open="toolsOpen"
      class="settings-section__disclosure"
      label="片段預覽（進階）"
    >
      <div v-if="toolsOpen" class="lyrics-settings__details">
        <UiHint
          >需在「本機音訊處理 → 工具與模型 → 音訊轉換工具」選用「Utawakui
          管理版本」。分析使用 HubertFA 與 Whisper
          small；正式歌詞音訊輔助仍未開放。</UiHint
        >
        <UiHint>每次分析約 30 秒、最多 10 句歌詞，結果僅在此預覽。</UiHint>
        <LyricsResearchPreviewTools />
      </div>
    </UiDisclosure>
  </SettingsSection>
</template>

<style scoped>
.lyrics-settings__notice {
  padding-block: var(--settings-row-padding-block, var(--ui-space-4));
  padding-inline-start: var(--settings-copy-inset, 0);
}
.lyrics-settings__details {
  display: grid;
  gap: var(--ui-space-3);
  padding-block: var(--settings-child-padding-block, var(--ui-space-3));
  padding-inline-start: var(--settings-copy-inset, 0);
  min-inline-size: 0;
}
</style>

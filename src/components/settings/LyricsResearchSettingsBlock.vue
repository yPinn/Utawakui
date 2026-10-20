<script setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { useLyricsResearch } from '../../composables/lyrics/useLyricsResearch.js';
import { Captions } from '../../icons/index.js';
import SettingsSection from './SettingsSection.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import LyricsExperimentalQueueSettings from './LyricsExperimentalQueueSettings.vue';
import LyricsResearchPreviewTools from './LyricsResearchPreviewTools.vue';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';

const research = useLyricsResearch();
const managementOpen = shallowRef(false);
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
onMounted(() => {
  void research.refresh();
  // Automatic work may change readiness while management is closed.
  timer = setInterval(() => void research.refresh(), 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <SettingsSection title="歌詞分段提示（實驗性）">
    <UiHint class="lyrics-settings__notice">
      僅供本機研究試用。時間精度尚待人工驗證；模型權重及字典之使用與散布授權範圍尚待釐清。
    </UiHint>
    <SettingsDocumentItem
      :icon="Captions"
      title="歌詞分析工具"
      description="估算中文、日文與英文歌詞的分段時間。"
      guidance="下載約 0.78 GB，安裝約 1.00 GB；建議預留 4 GB 可用空間。"
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
      </template>
      <template v-if="research.error.value" #feedback>
        <UiHint tone="danger" role="alert">{{ research.error.value }}</UiHint>
      </template>
    </SettingsDocumentItem>

    <LyricsExperimentalQueueSettings />

    <UiDisclosure
      v-model:open="managementOpen"
      class="settings-section__disclosure"
      label="工具管理與詳細說明"
    >
      <div class="lyrics-settings__details">
        <UiHint
          >請先展開「本機音訊處理」的「工具與模型」，在「音訊轉換工具」選擇「Utawakui
          管理版本」。</UiHint
        >
        <UiHint
          >此試用使用 HubertFA 與 Whisper
          small。正式的歌詞音訊輔助功能仍未開放；本試用不代表已取得模型或字典的使用與散布授權。</UiHint
        >
        <div class="lyrics-settings__actions">
          <UiButton
            variant="ghost"
            :disabled="research.busy.value"
            @click="research.refresh"
            >重新讀取</UiButton
          >
          <UiButton
            v-if="installed"
            variant="ghost"
            intent="danger"
            :disabled="research.busy.value"
            @click="research.action('remove')"
            >移除工具</UiButton
          >
          <UiButton
            v-if="installed && status !== 'damaged'"
            variant="secondary"
            :disabled="research.busy.value"
            @click="research.action('prepare')"
            >重新下載修復</UiButton
          >
          <UiButton
            v-if="status === 'ready'"
            variant="accent"
            :disabled="research.busy.value"
            @click="research.action('verify')"
            >檢查工具</UiButton
          >
        </div>
      </div>
    </UiDisclosure>

    <UiDisclosure
      v-model:open="toolsOpen"
      class="settings-section__disclosure"
      label="片段預覽（進階）"
    >
      <div v-if="toolsOpen" class="lyrics-settings__details">
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
.lyrics-settings__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  align-items: center;
}
</style>

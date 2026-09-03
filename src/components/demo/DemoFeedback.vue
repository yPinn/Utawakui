<script setup>
import { Music } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const CHIP_TONES = [
  { id: 'muted', label: '一般' },
  { id: 'accent', label: '已選取' },
  { id: 'current', label: '播放中' },
  { id: 'info', label: '處理中' },
  { id: 'success', label: '已完成' },
  { id: 'warning', label: '需注意' },
  { id: 'danger', label: '失敗' },
  { id: 'gated', label: '需啟用' },
];

const STATUS_TONES = [
  'muted',
  'accent',
  'info',
  'success',
  'warning',
  'danger',
  'current',
  'gated',
  'text',
  'highlight',
];

const HINT_TONES = [
  { id: 'muted', label: '一般提示：這個設定只影響目前工作區。' },
  { id: 'text', label: '主要提示：可使用方向鍵切換選項。' },
  { id: 'info', label: '資訊：正在確認本機 runtime 狀態。' },
  { id: 'success', label: '完成：Sidecar 已保存。' },
  { id: 'warning', label: '注意：還缺少選用 metadata。' },
  { id: 'danger', label: '失敗：來源檔案目前無法讀取。' },
  { id: 'gated', label: '需啟用：公開輸出尚未開啟。' },
];
</script>

<template>
  <div class="demo-feedback">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <div v-if="section.key === 'chips'" class="demo-sample-row">
        <UiChip v-for="tone in CHIP_TONES" :key="tone.id" :tone="tone.id">
          {{ tone.label }}
        </UiChip>
      </div>

      <div v-else-if="section.key === 'status-icons'" class="demo-status-grid">
        <div v-for="tone in STATUS_TONES" :key="tone" class="demo-status-item">
          <UiStatusIcon :icon="Music" :tone="tone" :label="tone" />
          <code>{{ tone }}</code>
        </div>
      </div>

      <div v-else-if="section.key === 'hints'" class="demo-sample-stack">
        <UiHint v-for="tone in HINT_TONES" :key="tone.id" :tone="tone.id">
          {{ tone.label }}
        </UiHint>
      </div>

      <div v-else-if="section.key === 'notices'" class="demo-sample-grid">
        <UiNotice
          tone="muted"
          title="一般通知"
          message="目前設定只保存在這次工作階段。"
          compact
        />
        <UiNotice
          tone="info"
          title="正在同步"
          message="正在確認本機 runtime 狀態。"
          compact
        />
        <UiNotice
          tone="success"
          title="處理完成"
          message="分離音軌已保存並可供播放。"
          compact
        />
        <UiNotice
          tone="warning"
          title="需要確認"
          message="公開輸出前仍需確認本次使用的內容。"
          action-label="查看"
          compact
        />
        <UiNotice
          tone="danger"
          title="讀取未完成"
          message="來源檔案目前無法讀取，請確認檔案仍存在。"
          action-label="重試"
          compact
        />
      </div>

      <div v-else-if="section.key === 'progress'" class="demo-sample-grid">
        <UiProgress label="匯入進度" :value="68" :max="100" value-text="68%" />
        <UiProgress label="正在準備音訊模型" indeterminate />
        <UiProgress
          label="批次分析"
          :value="12"
          :max="12"
          value-text="12／12"
        />
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
  gap: var(--ui-space-2);
}

.demo-status-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-control-height);
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.demo-status-item code {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}
</style>

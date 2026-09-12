<script setup>
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiProgress from '../ui/UiProgress.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoChipAppearance from './DemoChipAppearance.vue';
import DemoStatusIconAppearance from './DemoStatusIconAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const HINT_TONES = [
  { id: 'muted', label: '一般提示：這個設定只影響目前工作區。' },
  { id: 'text', label: '主要提示：可使用方向鍵切換選項。' },
  { id: 'info', label: '資訊：正在確認本機 runtime 狀態。' },
  { id: 'success', label: '完成：Sidecar 已保存。' },
  { id: 'warning', label: '注意：還缺少選用 metadata。' },
  { id: 'danger', label: '失敗：來源檔案目前無法讀取。' },
  { id: 'gated', label: '需啟用：公開輸出尚未開啟。' },
];

const REVIEWED_SECTION_KEYS = new Set(['chips', 'status-icons']);
</script>

<template>
  <div class="demo-feedback">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="REVIEWED_SECTION_KEYS.has(section.key)"
    >
      <DemoChipAppearance v-if="section.key === 'chips'" />

      <DemoStatusIconAppearance v-else-if="section.key === 'status-icons'" />

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
.demo-feedback {
  display: grid;
  gap: var(--ui-space-4);
}
</style>

<script setup>
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import DemoCandidateTrackThumb from './DemoCandidateTrackThumb.vue';
import DemoTrackThumbPrimitive from './DemoTrackThumbPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiTrackThumb · 單曲封面',
    note: '有效封面優先；沒有可用封面時顯示穩定的預設圖片，並保留獨立封面的名稱關係。',
    component: DemoCandidateTrackThumb,
    densities: [
      {
        id: 'standard',
        label: 'Standard · 40 CSS px',
        size: 'var(--ui-track-artwork-size-standard)',
      },
      {
        id: 'compact',
        label: 'Compact · 36 CSS px',
        size: 'var(--ui-track-artwork-size-dense)',
      },
    ],
    recipeSummary: '四個尺寸依閱讀距離與所在區域分工；佇列與播放器共用 48px。',
    recipes: [
      {
        id: 'dense-selection-36',
        label: '密集選擇 · 36px',
        size: 'var(--ui-track-artwork-size-dense)',
        note: '匯入候選：56px 選擇列內同時保留來源、版本與摘要。',
      },
      {
        id: 'track-row-40',
        label: '標準曲目列 · 40px',
        size: 'var(--ui-track-artwork-size-standard)',
        note: '曲目列：52px 最小列高內與歌名、歌手及操作並列。',
      },
      {
        id: 'playback-48',
        label: '播放操作 · 48px',
        size: 'var(--ui-track-artwork-size-prominent)',
        note: '佇列約 56px 高；播放器 76px 高，兩處共用同一尺寸。',
      },
      {
        id: 'metadata-64',
        label: '封面檢查 · 64px',
        size: 'var(--ui-track-artwork-size-preview)',
        note: '編輯資訊時提供較大的預覽，旁邊保留選擇與移除操作。',
      },
    ],
  },
  {
    key: 'current',
    title: '現行 UiTrackThumb',
    note: '保留現行封面、首字、空內容與圖片失敗行為，不套用候選版修正。',
    component: UiTrackThumb,
    densities: [{ id: 'active', label: 'Current · 40 CSS px', size: 40 }],
    recipeSummary: '目前仍有五個尺寸；播放器 52px 與佇列 48px 的用途最接近。',
    recipes: [
      {
        id: 'import-current-32',
        label: '匯入候選 · 32px',
        size: 32,
        note: '位於 56px 最小高度的選擇列。',
      },
      {
        id: 'track-row-current-40',
        label: '曲目列 · 40px',
        size: 40,
        note: '位於 52px 最小高度的資料列。',
      },
      {
        id: 'queue-current-48',
        label: '佇列 · 48px',
        size: 48,
        note: '封面加上下間距後，單列約 56px。',
      },
      {
        id: 'player-current-52',
        label: '播放器 · 52px',
        size: 52,
        note: '加上上下各 12px 間距，填滿 76px 播放列。',
      },
      {
        id: 'metadata-current-64',
        label: '封面編輯 · 64px',
        size: 64,
        note: '與 64px 預覽欄對齊。',
      },
    ],
  },
];
</script>

<template>
  <div class="demo-track-thumb-appearance">
    <p class="demo-track-thumb-appearance__intro">
      <strong>UiTrackThumb 表示單一曲目的方形封面位置。</strong>
      它維持封面、替代內容與空內容的固定位置；集合封面和資料列有各自的責任。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-track-thumb-layer"
      :class="`demo-track-thumb-layer--${layer.key}`"
      :data-track-thumb-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-track-thumb-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoTrackThumbPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-track-thumb-appearance,
.demo-track-thumb-layer {
  min-width: 0;
  display: grid;
}

.demo-track-thumb-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-track-thumb-appearance__intro,
.demo-track-thumb-layer__header h4,
.demo-track-thumb-layer__header p {
  margin: 0;
}

.demo-track-thumb-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-track-thumb-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-track-thumb-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-track-thumb-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-track-thumb-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-track-thumb-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-track-thumb-layer--current {
  color-scheme: dark;
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-space-3: 0.75rem;
  --ui-space-4: 1rem;
  --ui-space-5: 1.5rem;
  --ui-space-6: 2rem;
  --ui-border-width: 1px;
  --ui-radius-sm: 0.25rem;
  --ui-radius-md: 0.375rem;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-font-size-sm: 0.875rem;
  --ui-font-size-md: 1rem;
  --ui-font-weight-regular: 400;
  --ui-font-weight-semibold: 600;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-border: #3c4749;
}

:global(:root[data-ui-theme='light'] .demo-track-thumb-layer--current) {
  color-scheme: light;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
}

@container (max-width: 48rem) {
  .demo-track-thumb-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

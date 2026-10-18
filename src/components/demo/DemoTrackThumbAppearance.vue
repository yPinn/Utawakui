<script setup>
import DemoCandidateTrackThumb from './DemoCandidateTrackThumb.vue';
import DemoTrackThumbPrimitive from './DemoTrackThumbPrimitive.vue';
import DemoArtworkStates from './DemoArtworkStates.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 · 單曲封面',
    note: '有效封面優先，缺圖時使用預設圖片。',
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
    recipeSummary:
      '四個尺寸依閱讀距離與所在區域分工；48px 只用於左下 PlayerBar。',
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
        note: '左下 PlayerBar 專用；Queue 改用 40px 標準曲目列。',
      },
      {
        id: 'metadata-64',
        label: '封面檢查 · 64px',
        size: 'var(--ui-track-artwork-size-preview)',
        note: '編輯資訊時提供較大的預覽，旁邊保留選擇與移除操作。',
      },
    ],
  },
];
</script>

<template>
  <div class="demo-track-thumb-appearance">
    <p class="demo-track-thumb-appearance__intro">
      單曲封面、替代圖片與載入狀態。
    </p>

    <section class="demo-track-thumb-layer" data-artwork-source="production">
      <header class="demo-track-thumb-layer__header">
        <h4>正式 UiArtworkLoading／UiArtworkReveal</h4>
        <p>正式載入與操作揭露；下方為未採用提案。</p>
      </header>
      <DemoArtworkStates />
    </section>
    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-track-thumb-layer"
      :class="`demo-track-thumb-layer--${layer.key}`"
      :data-track-thumb-source="layer.key"
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-track-thumb-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-track-thumb-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

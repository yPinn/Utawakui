<script setup>
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import DemoCandidateCollageThumb from './DemoCandidateCollageThumb.vue';
import DemoCollageThumbPrimitive from './DemoCollageThumbPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiCollageThumb · 集合封面',
    note: '零首與無曲目共用空位置；一首使用完整方形，二至四首才進入等分四格。',
    component: DemoCandidateCollageThumb,
  },
  {
    key: 'current',
    title: '現行 UiCollageThumb',
    note: '保留現行四格空集合、壞圖位置與第二、第三格整體淡化，使用 active-token 快照。',
    component: UiCollageThumb,
  },
];
</script>

<template>
  <div class="demo-collage-thumb-appearance">
    <p class="demo-collage-thumb-appearance__intro">
      <strong>UiCollageThumb 表示一個集合的封面位置。</strong>
      它把不同來源比例裁進 caller
      指定的正方形，並解析自訂集合封面、單一成員、四格成員拼貼與空集合；內部只共用曲目圖像內容，不承接裁切選擇、單曲
      public contract 或資料列操作。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-collage-thumb-layer"
      :class="`demo-collage-thumb-layer--${layer.key}`"
      :data-collage-thumb-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-collage-thumb-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoCollageThumbPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-collage-thumb-appearance,
.demo-collage-thumb-layer {
  min-width: 0;
  display: grid;
}

.demo-collage-thumb-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-collage-thumb-appearance__intro,
.demo-collage-thumb-layer__header h4,
.demo-collage-thumb-layer__header p {
  margin: 0;
}

.demo-collage-thumb-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-collage-thumb-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-collage-thumb-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-collage-thumb-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-collage-thumb-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-collage-thumb-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-collage-thumb-layer--current {
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
  --ui-focus-width: 2px;
  --ui-focus-offset-inset: -2px;
  --ui-opacity-muted: 0.72;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-font-size-sm: 0.875rem;
  --ui-font-size-md: 1rem;
  --ui-font-size-lg: 1.125rem;
  --ui-font-weight-semibold: 600;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-line-height-title: 1.3;
  --ui-color-canvas: #1f2328;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-border: #3c4749;
  --ui-color-border-strong: #586568;
  --ui-color-focus: #dd7a64;
}

:global(:root[data-ui-theme='light'] .demo-collage-thumb-layer--current) {
  color-scheme: light;
  --ui-color-canvas: #f7f1e7;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-border-strong: #b9c4c0;
  --ui-color-focus: #d26a45;
}

@container (max-width: 48rem) {
  .demo-collage-thumb-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

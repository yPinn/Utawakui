<script setup>
import UiProgress from '../ui/UiProgress.vue';
import DemoCandidateProgress from './DemoCandidateProgress.vue';
import DemoProgressPrimitive from './DemoProgressPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '核准 Candidate UiProgress',
    note: '保留核准標本，供正式元件回歸比對。',
    component: DemoCandidateProgress,
    densities: [
      ['standard', 'Standard · 8 CSS px'],
      ['compact', 'Compact · 8 CSS px'],
    ],
  },
  {
    key: 'current',
    title: '正式 UiProgress · 已採用',
    note: '8px track、2px radius、自然換行與 reduced-motion-safe 不確定進度已統一。',
    component: UiProgress,
    densities: [['active', 'Current · 8 CSS px']],
  },
];
</script>

<template>
  <div class="demo-progress-appearance">
    <p class="demo-progress-appearance__intro">
      <strong>UiProgress 是有標籤的進度指示器。</strong>
      它只呈現工作進度；工作結果與後續操作由所在畫面顯示。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-progress-layer"
      :class="`demo-progress-layer--${layer.key}`"
      :data-progress-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-progress-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoProgressPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-progress-appearance,
.demo-progress-layer {
  min-width: 0;
  display: grid;
}

.demo-progress-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-progress-appearance__intro,
.demo-progress-layer__header h4,
.demo-progress-layer__header p {
  margin: 0;
}

.demo-progress-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-progress-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-progress-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-progress-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-progress-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-progress-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-progress-layer--current {
  color-scheme: dark;
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-space-3: 0.75rem;
  --ui-space-4: 1rem;
  --ui-space-5: 1.5rem;
  --ui-space-6: 2rem;
  --ui-border-width: 1px;
  --ui-radius-xs: 0.125rem;
  --ui-radius-sm: 0.25rem;
  --ui-radius-md: 0.375rem;
  --ui-radius-pill: 999rem;
  --ui-progress-track-size: 0.5rem;
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
  --ui-color-accent: #55a2a7;
  --ui-color-info: #7fb8bd;
  --ui-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
}

:global(:root[data-ui-theme='light'] .demo-progress-layer--current) {
  color-scheme: light;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-accent: #327a7f;
  --ui-color-info: #4d8793;
}

@container (max-width: 48rem) {
  .demo-progress-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

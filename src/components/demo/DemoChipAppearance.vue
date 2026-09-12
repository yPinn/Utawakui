<script setup>
import UiChip from '../ui/UiChip.vue';
import DemoCandidateChip from './DemoCandidateChip.vue';
import DemoChipPrimitive from './DemoChipPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiChip',
    note: '非互動的短狀態／屬性標籤；不透明語意文字搭配低強度 surface 與邊界。',
    component: DemoCandidateChip,
    sizes: [
      ['standard', 'Standard · 24 CSS px'],
      ['compact', 'Compact · 20 CSS px'],
    ],
  },
  {
    key: 'current',
    title: '現行 UiChip',
    note: '以 active token 快照呈現 content-driven 高度與現行無邊界 soft fill，不繼承 Candidate 樣式。',
    component: UiChip,
    sizes: [['active', 'Current · content-driven（約 21.5 CSS px）']],
  },
];
</script>

<template>
  <div class="demo-chip-appearance">
    <p class="demo-chip-appearance__intro">
      <strong>UiChip 是非互動的短狀態／屬性／數量標籤。</strong>
      互動需求改用對應 control。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-chip-layer"
      :class="`demo-chip-layer--${layer.key}`"
      :data-chip-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-chip-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoChipPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-chip-appearance,
.demo-chip-layer {
  min-width: 0;
  display: grid;
}

.demo-chip-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-chip-appearance__intro,
.demo-chip-layer__header h4,
.demo-chip-layer__header p {
  margin: 0;
}

.demo-chip-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-chip-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-chip-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-chip-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-chip-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-chip-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-chip-layer--current {
  color-scheme: dark;
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-radius-pill: 999rem;
  --ui-font-size-sm: 0.875rem;
  --ui-font-weight-semibold: 600;
  --ui-line-height-label: 1.25;
  --ui-color-canvas: #1f2328;
  --ui-color-surface-selected: #25474a;
  --ui-color-surface-playing: #4a332e;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-accent: #55a2a7;
  --ui-color-accent-soft: #25474a;
  --ui-color-current: #dd7a64;
  --ui-color-current-soft: #4a332e;
  --ui-color-info: #7fb8bd;
  --ui-color-info-soft: color-mix(in srgb, #7fb8bd 18%, transparent);
  --ui-color-success: #7bbd8b;
  --ui-color-success-soft: color-mix(in srgb, #7bbd8b 18%, transparent);
  --ui-color-warning: #d6a84f;
  --ui-color-warning-soft: color-mix(in srgb, #d6a84f 18%, transparent);
  --ui-color-danger: #dd7078;
  --ui-color-danger-soft: color-mix(in srgb, #dd7078 18%, transparent);
  --ui-color-gated: #d6a84f;
  --ui-color-gated-bg: #3a3226;
}

:global(:root[data-ui-theme='light'] .demo-chip-layer--current) {
  color-scheme: light;
  --ui-color-canvas: #f7f1e7;
  --ui-color-surface-selected: #dceee9;
  --ui-color-surface-playing: #f1d9cc;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-accent: #327a7f;
  --ui-color-accent-soft: #dceee9;
  --ui-color-current: #d26a45;
  --ui-color-current-soft: #f1d9cc;
  --ui-color-info: #4d8793;
  --ui-color-info-soft: color-mix(in srgb, #4d8793 18%, transparent);
  --ui-color-success: #5f9a72;
  --ui-color-success-soft: color-mix(in srgb, #5f9a72 18%, transparent);
  --ui-color-warning: #b78336;
  --ui-color-warning-soft: color-mix(in srgb, #b78336 18%, transparent);
  --ui-color-danger: #bd5961;
  --ui-color-danger-soft: color-mix(in srgb, #bd5961 18%, transparent);
  --ui-color-gated: #9a6b45;
  --ui-color-gated-bg: #f3eadc;
}

@container (max-width: 48rem) {
  .demo-chip-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

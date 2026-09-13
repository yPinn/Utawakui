<script setup>
import DemoTrackRowPrimitive from './DemoTrackRowPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiTrackRow · 曲目識別列',
    note: 'Candidate primitives；Standard 52／40px，Compact 44／36px。',
  },
  {
    key: 'current',
    title: '現行 UiTrackRow',
    note: '正式 Ui* 與 active-token 快照；52／40px。',
  },
];
</script>

<template>
  <div class="demo-track-row-appearance">
    <p class="demo-track-row-appearance__intro">
      <strong>UiTrackRow 只排一列曲目識別。</strong>
      流程、排序與操作結果由 caller 擁有。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-track-row-layer"
      :class="`demo-track-row-layer--${layer.key}`"
      :data-track-row-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-track-row-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoTrackRowPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-track-row-appearance,
.demo-track-row-layer {
  min-width: 0;
  display: grid;
}

.demo-track-row-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-track-row-appearance__intro,
.demo-track-row-layer__header h4,
.demo-track-row-layer__header p {
  margin: 0;
}

.demo-track-row-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-track-row-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-track-row-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-track-row-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-track-row-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-track-row-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-track-row-layer--current {
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
  --ui-radius-pill: 999rem;
  --ui-focus-width: 2px;
  --ui-focus-offset: 2px;
  --ui-focus-offset-inset: -2px;
  --ui-opacity-disabled: 0.5;
  --ui-motion-duration-feedback: 100ms;
  --ui-motion-easing-standard: ease-out;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-font-size-sm: 0.875rem;
  --ui-font-size-md: 1rem;
  --ui-font-size-lg: 1.125rem;
  --ui-font-weight-regular: 400;
  --ui-font-weight-semibold: 600;
  --ui-line-height-body: 1.5;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-line-height-title: 1.3;
  --ui-control-height: 1.875rem;
  --ui-icon-button-size-md: 2rem;
  --ui-checkbox-size: 1rem;
  --ui-track-row-min-height: 3.25rem;
  --ui-track-row-thumb-size: 2.5rem;
  --ui-track-row-gap: 0.5rem;
  --ui-track-row-padding-block: 0.25rem;
  --ui-track-row-padding-inline: 0.75rem;
  --ui-track-list-gap: 0.25rem;
  --ui-row-active-shadow: inset 3px 0 0 #55a2a7;
  --ui-color-canvas: #1f2328;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-surface-active: #3a464c;
  --ui-color-surface-selected: #25474a;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-border: #3c4749;
  --ui-color-border-strong: #586568;
  --ui-color-accent: #55a2a7;
  --ui-color-accent-soft: #25474a;
  --ui-color-current: #dd7a64;
  --ui-color-current-soft: #4a332e;
  --ui-color-focus: #dd7a64;
  --ui-color-success: #7bbd8b;
  --ui-color-success-soft: color-mix(in srgb, #7bbd8b 18%, transparent);
  --ui-color-danger: #dd7078;
  --ui-color-danger-soft: color-mix(in srgb, #dd7078 18%, transparent);
}

:global(:root[data-ui-theme='light'] .demo-track-row-layer--current) {
  color-scheme: light;
  --ui-row-active-shadow: inset 3px 0 0 #327a7f;
  --ui-color-canvas: #f7f1e7;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-surface-active: #e4ece8;
  --ui-color-surface-selected: #dceee9;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-border-strong: #b9c4c0;
  --ui-color-accent: #327a7f;
  --ui-color-accent-soft: #dceee9;
  --ui-color-current: #d26a45;
  --ui-color-current-soft: #f1d9cc;
  --ui-color-focus: #d26a45;
  --ui-color-success: #5f9a72;
  --ui-color-success-soft: color-mix(in srgb, #5f9a72 18%, transparent);
  --ui-color-danger: #bd5961;
  --ui-color-danger-soft: color-mix(in srgb, #bd5961 18%, transparent);
}

@container (max-width: 48rem) {
  .demo-track-row-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

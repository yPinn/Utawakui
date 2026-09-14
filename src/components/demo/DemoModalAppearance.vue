<script setup>
import DemoModalLayer from './DemoModalLayer.vue';

const LAYERS = Object.freeze([
  {
    key: 'candidate',
    title: 'Token v2 候選 UiModal',
    note: 'Greenfield raised shell＋on-raised 欄位層級；384／512／768px、固定 header／footer 與 body-only scroll。',
  },
  {
    key: 'current',
    title: '現行 UiModal',
    note: '使用正式元件與 active-token 快照；保留 default／notice／wide、整面捲動與既有焦點行為。',
  },
]);
</script>

<template>
  <div class="demo-modal-appearance">
    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-modal-layer"
      :class="`demo-modal-layer--${layer.key}`"
      :data-modal-source="layer.key"
      :data-demo-review-layer="layer.key"
      :aria-labelledby="`demo-modal-${layer.key}-title`"
    >
      <header class="demo-modal-layer__header">
        <h4 :id="`demo-modal-${layer.key}-title`">{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>
      <DemoModalLayer :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-modal-appearance,
.demo-modal-layer {
  min-inline-size: 0;
  display: grid;
}

.demo-modal-appearance {
  gap: var(--ui-space-6);
}

.demo-modal-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-modal-layer__header {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-modal-layer__header h4,
.demo-modal-layer__header p {
  margin: 0;
}

.demo-modal-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-modal-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-modal-layer--current,
:global(:root[data-demo-modal-source='current']) {
  color-scheme: dark;
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
  --ui-color-accent-hover: #6ab4b8;
  --ui-color-accent-contrast: #102326;
  --ui-color-focus: #dd7a64;
  --ui-color-info: #7fb8bd;
  --ui-color-info-soft: color-mix(in srgb, #7fb8bd 18%, transparent);
  --ui-color-warning: #d6a84f;
  --ui-color-warning-soft: color-mix(in srgb, #d6a84f 18%, transparent);
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-space-3: 0.75rem;
  --ui-space-4: 1rem;
  --ui-space-5: 1.5rem;
  --ui-space-6: 2rem;
  --ui-space-8: 4rem;
  --ui-border-width: 1px;
  --ui-radius-md: 0.375rem;
  --ui-radius: var(--ui-radius-md);
  --ui-radius-lg: 0.5rem;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-font-size-sm: 0.875rem;
  --ui-font-size-md: 1rem;
  --ui-font-size-lg: 1.125rem;
  --ui-font-size-xl: 1.5rem;
  --ui-font-weight-regular: 400;
  --ui-font-weight-semibold: 600;
  --ui-font-weight-bold: 650;
  --ui-line-height-heading: 1.2;
  --ui-line-height-title: 1.3;
  --ui-line-height-body: 1.5;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-control-height: 1.875rem;
  --ui-icon-button-size-md: 2rem;
  --ui-field-height: 1.875rem;
  --ui-field-padding-block: 0.25rem;
  --ui-field-padding-inline: 0.5rem;
  --ui-field-radius: 0.375rem;
  --ui-field-bg: #344046;
  --ui-field-bg-hover: #3a464c;
  --ui-field-fg: #f7f1e7;
  --ui-field-placeholder: #aeb8b6;
  --ui-field-border: #3c4749;
  --ui-field-border-hover: #586568;
  --ui-field-border-invalid: #dd7078;
  --ui-focus-width: 2px;
  --ui-focus-offset: 2px;
  --ui-opacity-disabled: 0.5;
  --ui-modal-width-default: 26.25rem;
  --ui-modal-width-notice: 40rem;
  --ui-modal-width-wide: 45rem;
  --ui-color-overlay-scrim: rgb(0 0 0 / 55%);
  --ui-shadow-overlay: 0 0.75rem 1.875rem rgb(0 0 0 / 28%);
  --ui-z-dialog: 200;
}

:global(:root[data-ui-theme='light'] .demo-modal-layer--current),
:global(:root[data-ui-theme='light'][data-demo-modal-source='current']) {
  color-scheme: light;
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
  --ui-color-accent-hover: #286a6e;
  --ui-color-accent-contrast: #fffdfa;
  --ui-color-focus: #d26a45;
  --ui-color-info: #4d8793;
  --ui-color-info-soft: color-mix(in srgb, #4d8793 18%, transparent);
  --ui-color-warning: #b78336;
  --ui-color-warning-soft: color-mix(in srgb, #b78336 18%, transparent);
  --ui-field-bg: #edf2ef;
  --ui-field-bg-hover: #e4ece8;
  --ui-field-fg: #1f2328;
  --ui-field-placeholder: #69747a;
  --ui-field-border: #d8ded9;
  --ui-field-border-hover: #b9c4c0;
  --ui-field-border-invalid: #bd5961;
  --ui-shadow-overlay: 0 1rem 2.375rem rgb(31 35 40 / 16%);
}

@media (max-width: 48rem) {
  .demo-modal-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

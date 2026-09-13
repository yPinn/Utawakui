<script setup>
import DemoActionMenuLayer from './DemoActionMenuLayer.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiActionMenu',
    note: 'Trigger-neutral compound primitive；完整 menu keyboard、viewport collision 與精簡 icon／label／submenu lanes。',
  },
  {
    key: 'current',
    title: '現行 UiContextMenu',
    note: '正式元件與 active-token 快照；保留目前 focus、ARIA、固定 lanes 與 Current surface 真值。',
  },
];
</script>

<template>
  <div class="demo-action-menu-appearance">
    <p class="demo-action-menu-appearance__intro">
      <strong>UiActionMenu 是一組短動作的浮動選單。</strong>
      Caller 擁有 Ellipsis／右鍵 trigger、anchor 與產品 action；選單擁有
      item、焦點、碰撞與關閉。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-action-menu-layer"
      :class="`demo-action-menu-layer--${layer.key}`"
      :data-action-menu-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-action-menu-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoActionMenuLayer :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-action-menu-appearance,
.demo-action-menu-layer {
  min-width: 0;
  display: grid;
}

.demo-action-menu-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-action-menu-appearance__intro,
.demo-action-menu-layer__header h4,
.demo-action-menu-layer__header p {
  margin: 0;
}

.demo-action-menu-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-action-menu-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-action-menu-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-action-menu-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-action-menu-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-action-menu-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-action-menu-layer--current {
  color-scheme: dark;
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-space-3: 0.75rem;
  --ui-space-4: 1rem;
  --ui-space-5: 1.5rem;
  --ui-border-width: 1px;
  --ui-radius-md: 0.375rem;
  --ui-focus-width: 2px;
  --ui-focus-offset: 2px;
  --ui-focus-offset-inset: -2px;
  --ui-opacity-disabled: 0.5;
  --ui-control-height: 1.875rem;
  --ui-icon-button-size-md: 2rem;
  --ui-menu-item-height: 2rem;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-font-size-sm: 0.875rem;
  --ui-font-size-lg: 1.125rem;
  --ui-font-weight-regular: 400;
  --ui-font-weight-semibold: 600;
  --ui-line-height-body: 1.5;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-line-height-title: 1.3;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-surface-active: #3a464c;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-text-subtle: #8f9a99;
  --ui-color-border: #3c4749;
  --ui-color-border-strong: #586568;
  --ui-color-focus: #dd7a64;
  --ui-color-danger: #dd7078;
  --ui-shadow-overlay: 0 0.75rem 1.875rem rgb(0 0 0 / 28%);
}

:global(:root[data-ui-theme='light'] .demo-action-menu-layer--current) {
  color-scheme: light;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-surface-active: #e4ece8;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-text-subtle: #7b858a;
  --ui-color-border: #d8ded9;
  --ui-color-border-strong: #b9c4c0;
  --ui-color-focus: #d26a45;
  --ui-color-danger: #bd5961;
  --ui-shadow-overlay: 0 1rem 2.375rem rgb(31 35 40 / 16%);
}

:global(:root[data-demo-action-menu-source='current'] .ui-context-menu) {
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-border-width: 1px;
  --ui-radius-md: 0.375rem;
  --ui-focus-width: 2px;
  --ui-focus-offset-inset: -2px;
  --ui-opacity-disabled: 0.5;
  --ui-menu-item-height: 2rem;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-font-size-sm: 0.875rem;
  --ui-font-weight-regular: 400;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-color-surface: #292f35;
  --ui-color-surface-hover: #344046;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-border: #3c4749;
  --ui-color-focus: #dd7a64;
  --ui-color-danger: #dd7078;
  --ui-shadow-overlay: 0 0.75rem 1.875rem rgb(0 0 0 / 28%);
}

:global(
  :root[data-ui-theme='light'][data-demo-action-menu-source='current']
    .ui-context-menu
) {
  --ui-color-surface: #fffdfa;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-focus: #d26a45;
  --ui-color-danger: #bd5961;
  --ui-shadow-overlay: 0 1rem 2.375rem rgb(31 35 40 / 16%);
}

@container (max-width: 48rem) {
  .demo-action-menu-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

<script setup>
import UiTabs from '../ui/UiTabs.vue';
import DemoCandidateTabs from './DemoCandidateTabs.vue';
import DemoTabsPrimitive from './DemoTabsPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiTabs',
    note: 'Panel 與 Bar 都維持真實 tab／tabpanel；外觀 variant 不改變互動語意。',
    component: DemoCandidateTabs,
    sizes: [
      ['standard', 'Standard · 36 CSS px'],
      ['compact', 'Compact · 32 CSS px'],
    ],
  },
  {
    key: 'current',
    title: '現行 UiTabs',
    note: '以 active token 快照呈現 30px 與現行 selected tile，不繼承 Candidate 樣式。',
    component: UiTabs,
    sizes: [['active', 'Current · 30 CSS px']],
  },
];
</script>

<template>
  <div class="demo-tabs-appearance">
    <p class="demo-tabs-appearance__intro">
      <strong>Tabs 只切換同一工作區內互斥 panels。</strong>
      Filter、mode switch 與全域 navigation 不使用 UiTabs。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-tabs-layer"
      :class="`demo-tabs-layer--${layer.key}`"
      :data-tabs-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-tabs-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoTabsPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-tabs-appearance,
.demo-tabs-layer {
  min-width: 0;
  display: grid;
}

.demo-tabs-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-tabs-appearance__intro,
.demo-tabs-layer__header h4,
.demo-tabs-layer__header p {
  margin: 0;
}

.demo-tabs-appearance__intro {
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-tabs-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-tabs-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-tabs-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-tabs-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-tabs-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-tabs-layer--current {
  color-scheme: dark;
  --ui-control-height: 1.875rem;
  --ui-color-canvas: #1f2328;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-surface-active: #3a474d;
  --ui-color-surface-selected: #25474a;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-text-subtle: #899593;
  --ui-color-border: #3c4749;
  --ui-color-border-strong: #586568;
  --ui-color-accent: #55a2a7;
  --ui-color-accent-hover: #6ab4b8;
  --ui-color-focus: #dd7a64;
  --ui-opacity-disabled: 0.5;
}

:global(:root[data-ui-theme='light'] .demo-tabs-layer--current) {
  color-scheme: light;
  --ui-color-canvas: #f7f1e7;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #ffffff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-surface-active: #e2ebe7;
  --ui-color-surface-selected: #dceee9;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-text-subtle: #7a858a;
  --ui-color-border: #d8ded9;
  --ui-color-border-strong: #b9c4c0;
  --ui-color-accent: #327a7f;
  --ui-color-accent-hover: #286a6e;
  --ui-color-focus: #d26a45;
}

@container (max-width: 48rem) {
  .demo-tabs-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

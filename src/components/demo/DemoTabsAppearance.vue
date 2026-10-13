<script setup>
import DemoCandidateTabs from './DemoCandidateTabs.vue';
import DemoTabsPrimitive from './DemoTabsPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 UiTabs',
    note: 'Panel 與 Bar 都維持真實 tab／tabpanel；外觀 variant 不改變互動語意。',
    component: DemoCandidateTabs,
    sizes: [
      ['standard', 'Standard · 36 CSS px'],
      ['compact', 'Compact · 32 CSS px'],
    ],
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-tabs-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-tabs-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

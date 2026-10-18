<script setup>
import DemoCandidateStatusIcon from './DemoCandidateStatusIcon.vue';
import DemoStatusIconPrimitive from './DemoStatusIconPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '樣式預覽 · UiStatusIcon',
    note: '狀態圖示與語意色，不提供操作。',
    component: DemoCandidateStatusIcon,
    sizes: [
      ['standard', 'Standard · 24 CSS px'],
      ['compact', 'Compact · 20 CSS px'],
    ],
    includeCompatibilityTones: false,
  },
];
</script>

<template>
  <div class="demo-status-icon-appearance">
    <p class="demo-status-icon-appearance__intro">
      非互動狀態圖示；文字狀態用 UiChip，操作用按鈕。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-status-icon-layer"
      :class="`demo-status-icon-layer--${layer.key}`"
      :data-status-icon-source="layer.key"
    >
      <header class="demo-status-icon-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoStatusIconPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-status-icon-appearance,
.demo-status-icon-layer {
  min-width: 0;
  display: grid;
}

.demo-status-icon-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-status-icon-appearance__intro,
.demo-status-icon-layer__header h4,
.demo-status-icon-layer__header p {
  margin: 0;
}

.demo-status-icon-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-status-icon-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-status-icon-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-status-icon-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-status-icon-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-status-icon-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-status-icon-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

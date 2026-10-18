<script setup>
import DemoCandidateChip from './DemoCandidateChip.vue';
import DemoChipPrimitive from './DemoChipPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '樣式預覽 · UiChip',
    note: '短狀態與屬性標籤，不提供操作。',
    component: DemoCandidateChip,
    sizes: [
      ['standard', 'Standard · 24 CSS px'],
      ['compact', 'Compact · 20 CSS px'],
    ],
  },
];
</script>

<template>
  <div class="demo-chip-appearance">
    <p class="demo-chip-appearance__intro">
      顯示短狀態、屬性或數量，不提供操作。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-chip-layer"
      :class="`demo-chip-layer--${layer.key}`"
      :data-chip-source="layer.key"
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-chip-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-chip-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

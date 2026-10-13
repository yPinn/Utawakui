<script setup>
import DemoCandidateChip from './DemoCandidateChip.vue';
import DemoChipPrimitive from './DemoChipPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 UiChip',
    note: '非互動的短狀態／屬性標籤；不透明語意文字搭配低強度 surface 與邊界。',
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
      <strong>UiChip 是非互動的短狀態／屬性／數量標籤。</strong>
      互動需求改用對應 control。
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

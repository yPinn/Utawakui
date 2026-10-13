<script setup>
import DemoTrackRowPrimitive from './DemoTrackRowPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 UiTrackRow · 曲目識別列',
    note: '提案 primitives；Standard 52／40px，Compact 44／36px。',
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-track-row-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-track-row-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

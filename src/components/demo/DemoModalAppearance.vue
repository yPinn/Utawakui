<script setup>
import DemoModalLayer from './DemoModalLayer.vue';
import DemoModalProduction from './DemoModalProduction.vue';

const LAYERS = Object.freeze([
  {
    key: 'candidate',
    title: '未採用提案 UiModal',
    note: 'Greenfield raised shell＋on-raised 欄位層級；384／512／768px、固定 header／footer 與 body-only scroll。',
  },
]);
</script>

<template>
  <div class="demo-modal-appearance">
    <section
      class="demo-modal-layer"
      data-modal-source="production"
      aria-labelledby="demo-modal-production-title"
    >
      <header class="demo-modal-layer__header">
        <h4 id="demo-modal-production-title">正式 UiModal</h4>
        <p>關閉限制與焦點恢復；下方另列未採用提案。</p>
      </header>
      <DemoModalProduction />
    </section>
    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-modal-layer"
      :class="`demo-modal-layer--${layer.key}`"
      :data-modal-source="layer.key"
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-modal-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@media (max-width: 48rem) {
  .demo-modal-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

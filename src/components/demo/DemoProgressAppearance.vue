<script setup>
import DemoProgressPrimitive from './DemoProgressPrimitive.vue';
</script>

<template>
  <div class="demo-progress-appearance">
    <p class="demo-progress-appearance__intro">
      <strong>UiProgress 是有標籤的進度指示器。</strong>
      它只呈現工作進度；工作結果與後續操作由所在畫面顯示。
    </p>

    <section class="demo-progress-layer" data-progress-source="production">
      <header class="demo-progress-layer__header">
        <h4>正式 UiProgress</h4>
        <p>確定進度與不定進度。</p>
      </header>

      <DemoProgressPrimitive />
    </section>
  </div>
</template>

<style scoped>
.demo-progress-appearance,
.demo-progress-layer {
  min-width: 0;
  display: grid;
}

.demo-progress-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-progress-appearance__intro,
.demo-progress-layer__header h4,
.demo-progress-layer__header p {
  margin: 0;
}

.demo-progress-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-progress-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-progress-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-progress-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-progress-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-progress-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-progress-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

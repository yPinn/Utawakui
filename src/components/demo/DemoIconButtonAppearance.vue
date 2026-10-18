<script setup>
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import DemoIconButtonPrimitive from './DemoIconButtonPrimitive.vue';
import DemoIconButtonRecipes from './DemoIconButtonRecipes.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '正式 UiIconButton',
    note: 'Routine target 隨 density 為 36／32px；44px lg 只用於 Primary transport 等明確強調角色。',
    component: UiIconButton,
    actionComponent: UiButton,
    actionVariant: 'secondary',
    fieldNote: '同列控制項 · Standard／Compact',
    stateNote:
      'Ghost／Accent／Command／Overlay 皆有 authored hover 與 pressed。',
    sizes: [
      ['candidate-standard', 'standard', 'md', 'Standard routine · 36 CSS px'],
      ['candidate-compact', 'compact', 'md', 'Compact routine · 32 CSS px'],
      [
        'candidate-primary-transport',
        'primary-transport',
        'lg',
        'Token v2 Primary transport · 44 CSS px',
      ],
    ],
  },
];
</script>

<template>
  <div class="demo-icon-button-appearance">
    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-icon-button-layer"
      :class="`demo-icon-button-layer--${layer.key}`"
      :data-icon-button-source="layer.key"
    >
      <header class="demo-icon-button-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoIconButtonPrimitive :layer="layer" />
      <DemoIconButtonRecipes :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-icon-button-appearance,
.demo-icon-button-layer {
  min-width: 0;
  display: grid;
}

.demo-icon-button-appearance {
  gap: var(--ui-space-5);
}

.demo-icon-button-layer {
  gap: var(--ui-space-5);
  padding: var(--ui-space-4);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
  container-type: inline-size;
}

.demo-icon-button-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-icon-button-layer__header h4,
.demo-icon-button-layer__header p {
  margin: 0;
}

.demo-icon-button-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-icon-button-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 48rem) {
  .demo-icon-button-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

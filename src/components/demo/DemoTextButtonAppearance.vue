<script setup>
import UiTextButton from '../ui/UiTextButton.vue';
import DemoTextButtonPrimitive from './DemoTextButtonPrimitive.vue';
import DemoTextButtonRecipes from './DemoTextButtonRecipes.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2／已遷移 UiTextButton',
    note: '預設無底線；hover／focus-visible 顯示底線。',
    component: UiTextButton,
    appearanceContract: '預設無底線 · hover／focus-visible underline',
    overflowNote: '溢位沿用 UiMarqueeText；reduced motion 回到單行省略。',
    overflowContract: 'UiMarqueeText owns overflow／tooltip／reduced motion',
    recipeProps: {},
    stateNote:
      'Default 無底線；hover／focus-visible 顯示底線；pressed 沿用 hover；disabled 50%。',
  },
];
</script>

<template>
  <div class="demo-text-button-appearance">
    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-text-button-layer"
      :class="`demo-text-button-layer--${layer.key}`"
      :data-text-button-source="layer.key"
    >
      <header class="demo-text-button-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoTextButtonPrimitive :layer="layer" />
      <DemoTextButtonRecipes :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-text-button-appearance,
.demo-text-button-layer {
  min-width: 0;
  display: grid;
}

.demo-text-button-appearance {
  gap: var(--ui-space-5);
}

.demo-text-button-layer {
  gap: var(--ui-space-5);
  padding: var(--ui-space-4);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
  container-type: inline-size;
}

.demo-text-button-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-text-button-layer__header h4,
.demo-text-button-layer__header p {
  margin: 0;
}

.demo-text-button-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-text-button-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 48rem) {
  .demo-text-button-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

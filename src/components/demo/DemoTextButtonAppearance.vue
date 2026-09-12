<script setup>
import UiTextButton from '../ui/UiTextButton.vue';
import DemoCandidateTextButton from './DemoCandidateTextButton.vue';
import DemoTextButtonPrimitive from './DemoTextButtonPrimitive.vue';
import DemoTextButtonRecipes from './DemoTextButtonRecipes.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 Text Action',
    note: '預設無底線；hover／focus-visible 顯示底線。',
    component: DemoCandidateTextButton,
    appearanceContract: '預設無底線 · hover／focus-visible underline',
    recipeProps: {},
    stateNote:
      'Default 無底線；hover／focus-visible 顯示底線；pressed 沿用 hover；disabled 50%。',
  },
  {
    key: 'current',
    title: '現行 UiTextButton · Text Action baseline',
    note: '現行同樣是 Default 無底線，hover／focus-visible 顯示底線。',
    component: UiTextButton,
    appearanceContract: '僅 hover／focus-visible 顯示底線',
    recipeProps: {},
    stateNote:
      'Default 無底線；hover／focus 顯示底線；pressed／disabled 沒有獨立樣式。',
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
      :data-demo-review-layer="layer.key"
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
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-text-button-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-button-layer--current {
  --ui-color-canvas: #1f2328;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-text-subtle: #aeb8b6;
  --ui-color-border: #3c4749;
  --ui-color-border-strong: #586568;
  --ui-color-accent: #55a2a7;
  --ui-color-focus: #dd7a64;
}

:global(:root[data-ui-theme='light'] .demo-text-button-layer--current) {
  --ui-color-canvas: #f7f1e7;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #ffffff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-text-subtle: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-border-strong: #b9c4c0;
  --ui-color-accent: #327a7f;
  --ui-color-focus: #d26a45;
}

@container (max-width: 48rem) {
  .demo-text-button-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

<script setup>
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import DemoCandidateButton from './DemoCandidateButton.vue';
import DemoCandidateIconButton from './DemoCandidateIconButton.vue';
import DemoIconButtonPrimitive from './DemoIconButtonPrimitive.vue';
import DemoIconButtonRecipes from './DemoIconButtonRecipes.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 Icon Button',
    note: 'Routine target 隨 density 為 36／32px；44px lg 只用於 Primary transport 等明確強調角色。',
    component: DemoCandidateIconButton,
    actionComponent: DemoCandidateButton,
    actionVariant: 'secondary',
    fieldNote: 'Candidate 同列 control boxes · 36／32px',
    stateNote: 'Ghost／Accent／Overlay 皆有 authored hover 與 pressed。',
    sizes: [
      ['candidate-standard', 'standard', 'md', 'Standard routine · 36 CSS px'],
      ['candidate-compact', 'compact', 'md', 'Compact routine · 32 CSS px'],
      [
        'candidate-primary-transport',
        'primary-transport',
        'lg',
        'Candidate Primary transport · 44 CSS px',
      ],
    ],
  },
  {
    key: 'current',
    title: '現行 UiIconButton',
    note: 'Active token 快照保持 md 32px／lg 44px；不繼承 Candidate 的 routine 尺寸、focus 色或互動補強。',
    component: UiIconButton,
    actionComponent: UiButton,
    actionVariant: 'ghost',
    fieldNote: 'Current icon 32px／Field＋Button 30px',
    stateNote:
      'Current Accent／Overlay 無 authored pressed；Overlay 亦無獨立 hover。',
    sizes: [
      ['current-md', 'current-md', 'md', 'Current md · 32 CSS px'],
      ['current-lg', 'current-lg', 'lg', 'Current lg · 44 CSS px'],
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
      :data-demo-review-layer="layer.key"
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
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-icon-button-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-icon-button-layer--current {
  --ui-control-height: 1.875rem;
  --ui-icon-button-size-md: 2rem;
  --ui-icon-button-size-lg: 2.75rem;
  --ui-field-height: 1.875rem;
  --ui-field-padding-block: 0.25rem;
  --ui-field-padding-inline: 0.5rem;
  --ui-field-radius: 0.375rem;
  --ui-field-bg: #344046;
  --ui-field-bg-hover: #3a464c;
  --ui-field-fg: #f7f1e7;
  --ui-field-placeholder: #aeb8b6;
  --ui-field-border: #3c4749;
  --ui-field-border-hover: #536165;
  --ui-color-canvas: #1f2328;
  --ui-color-surface: #292f35;
  --ui-color-surface-hover: #344046;
  --ui-color-surface-active: #3a464c;
  --ui-color-surface-selected: #25474a;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-accent: #55a2a7;
  --ui-color-accent-hover: #6ab4b8;
  --ui-color-accent-contrast: #102326;
  --ui-color-accent-contrast-muted: color-mix(
    in srgb,
    var(--ui-color-accent-contrast) 75%,
    var(--ui-color-accent)
  );
  --ui-color-overlay-contrast: #fff;
  --ui-color-focus: #dd7a64;
  --ui-motion-easing-standard: ease-out;
}

:global(:root[data-ui-theme='light'] .demo-icon-button-layer--current) {
  --ui-field-bg: #edf2ef;
  --ui-field-bg-hover: #e4ece8;
  --ui-field-fg: #1f2328;
  --ui-field-placeholder: #69747a;
  --ui-field-border: #d8ded9;
  --ui-field-border-hover: #b9c4c0;
  --ui-color-canvas: #f4f0e8;
  --ui-color-surface: #f7f4ed;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-surface-active: #e4ece8;
  --ui-color-surface-selected: #dceee9;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-accent: #327a7f;
  --ui-color-accent-hover: #286a6e;
  --ui-color-accent-contrast: #fffdfa;
  --ui-color-focus: #d26a45;
}

@container (max-width: 48rem) {
  .demo-icon-button-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

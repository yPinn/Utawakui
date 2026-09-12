<script setup>
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import DemoCandidateStatusIcon from './DemoCandidateStatusIcon.vue';
import DemoStatusIconPrimitive from './DemoStatusIconPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiStatusIcon',
    note: '24／20px 非互動狀態 glyph；語意色使用低強度 supporting surface、細邊界與固定 16-unit icon。',
    component: DemoCandidateStatusIcon,
    sizes: [
      ['standard', 'Standard · 24 CSS px'],
      ['compact', 'Compact · 20 CSS px'],
    ],
    includeCompatibilityTones: false,
  },
  {
    key: 'current',
    title: '現行 UiStatusIcon',
    note: '以 active token 快照呈現 24px neutral circle、現行語意前景與 compatibility tones，不繼承 Candidate 樣式。',
    component: UiStatusIcon,
    sizes: [['active', 'Current · 24 CSS px']],
    includeCompatibilityTones: true,
  },
];
</script>

<template>
  <div class="demo-status-icon-appearance">
    <p class="demo-status-icon-appearance__intro">
      <strong>UiStatusIcon 是非互動狀態 glyph。</strong>
      有文字用 UiChip；可點擊用 Button。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-status-icon-layer"
      :class="`demo-status-icon-layer--${layer.key}`"
      :data-status-icon-source="layer.key"
      :data-demo-review-layer="layer.key"
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
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-status-icon-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-status-icon-layer--current {
  color-scheme: dark;
  --ui-space-5: 1.5rem;
  --ui-radius-pill: 999rem;
  --ui-motion-duration-slow: 280ms;
  --ui-color-surface-hover: #344046;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-accent: #55a2a7;
  --ui-color-current: #dd7a64;
  --ui-color-current-soft: #4a332e;
  --ui-color-info: #7fb8bd;
  --ui-color-success: #7bbd8b;
  --ui-color-warning: #d6a84f;
  --ui-color-danger: #dd7078;
  --ui-color-gated: #d6a84f;
  --ui-color-gated-bg: #3a3226;
}

:global(:root[data-ui-theme='light'] .demo-status-icon-layer--current) {
  color-scheme: light;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-accent: #327a7f;
  --ui-color-current: #d26a45;
  --ui-color-current-soft: #f1d9cc;
  --ui-color-info: #4d8793;
  --ui-color-success: #5f9a72;
  --ui-color-warning: #b78336;
  --ui-color-danger: #bd5961;
  --ui-color-gated: #9a6b45;
  --ui-color-gated-bg: #f3eadc;
}

@container (max-width: 48rem) {
  .demo-status-icon-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

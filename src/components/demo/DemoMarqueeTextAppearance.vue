<script setup>
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import DemoCandidateMarqueeText from './DemoCandidateMarqueeText.vue';
import DemoMarqueeTextPrimitive from './DemoMarqueeTextPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiMarqueeText · 單行過長文字',
    note: '過長文字在指向或聚焦時揭露一次，到達末端後停留；離開後回到開頭。',
    component: DemoCandidateMarqueeText,
    densities: [
      ['standard', 'Standard · 外層 12px inset'],
      ['compact', 'Compact · 外層 8px inset'],
    ],
  },
  {
    key: 'current',
    title: '現行 UiMarqueeText',
    note: '以現行樣式呈現：過長文字載入後會自動往返，短文字也會保留完整內容提示。',
    component: UiMarqueeText,
    densities: [['active', 'Current · 外層 8px inset']],
  },
];
</script>

<template>
  <div class="demo-marquee-appearance">
    <p class="demo-marquee-appearance__intro">
      <strong>UiMarqueeText 是單行過長文字的顯示方式。</strong>
      寬度、文字層級與操作意義仍由所在畫面決定。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-marquee-layer"
      :class="`demo-marquee-layer--${layer.key}`"
      :data-marquee-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-marquee-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoMarqueeTextPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-marquee-appearance,
.demo-marquee-layer {
  min-width: 0;
  display: grid;
}

.demo-marquee-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-marquee-appearance__intro,
.demo-marquee-layer__header h4,
.demo-marquee-layer__header p {
  margin: 0;
}

.demo-marquee-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-marquee-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-marquee-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-marquee-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-marquee-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-marquee-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-marquee-layer--current {
  color-scheme: dark;
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-space-3: 0.75rem;
  --ui-space-4: 1rem;
  --ui-space-5: 1.5rem;
  --ui-space-6: 2rem;
  --ui-border-width: 1px;
  --ui-radius-sm: 0.25rem;
  --ui-radius-md: 0.375rem;
  --ui-control-height-compact: 2rem;
  --ui-focus-width: 2px;
  --ui-focus-offset: 2px;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-font-size-sm: 0.875rem;
  --ui-font-size-md: 1rem;
  --ui-font-size-lg: 1.125rem;
  --ui-font-weight-semibold: 600;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-line-height-title: 1.3;
  --ui-line-height-body: 1.5;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-border: #3c4749;
  --ui-color-focus: #78bdc2;
}

:global(:root[data-ui-theme='light'] .demo-marquee-layer--current) {
  color-scheme: light;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-focus: #327a7f;
}

@container (max-width: 48rem) {
  .demo-marquee-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

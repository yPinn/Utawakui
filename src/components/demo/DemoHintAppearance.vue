<script setup>
import UiHint from '../ui/UiHint.vue';
import DemoCandidateHint from './DemoCandidateHint.vue';
import DemoHintPrimitive from './DemoHintPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiHint · 輔助文字',
    note: '用於獨立、非互動且可自然換行的短說明；欄位關聯、即時宣告與位置由所在畫面決定。',
    component: DemoCandidateHint,
    densities: [
      ['standard', 'Standard · 14 CSS px／1.4'],
      ['compact', 'Compact · 14 CSS px／1.4'],
    ],
  },
  {
    key: 'current',
    title: '現行 UiHint',
    note: '以現行樣式呈現 14px 小字、七種色彩狀態與既有的留白／置中行為；不套用候選版的換行規則。',
    component: UiHint,
    densities: [['active', 'Current · 14 CSS px／1.4']],
  },
];
</script>

<template>
  <div class="demo-hint-appearance">
    <p class="demo-hint-appearance__intro">
      <strong>UiHint 目前保留為相容元件；F8 以獨立輔助文字檢查。</strong>
      跨功能使用只證明這種文字樣式可共用，不代表一定需要獨立 Vue
      元件。正式遷移前仍需比較共用文字樣式與各功能自行組合；它不是欄位說明、結構化通知或專用空狀態。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-hint-layer"
      :class="`demo-hint-layer--${layer.key}`"
      :data-hint-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-hint-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoHintPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-hint-appearance,
.demo-hint-layer {
  min-width: 0;
  display: grid;
}

.demo-hint-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-hint-appearance__intro,
.demo-hint-layer__header h4,
.demo-hint-layer__header p {
  margin: 0;
}

.demo-hint-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-hint-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-hint-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-hint-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-hint-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-hint-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-hint-layer--current {
  color-scheme: dark;
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-space-3: 0.75rem;
  --ui-space-4: 1rem;
  --ui-space-5: 1.5rem;
  --ui-space-6: 2rem;
  --ui-radius-sm: 0.25rem;
  --ui-radius-md: 0.375rem;
  --ui-border-width: 1px;
  --ui-font-size-sm: 0.875rem;
  --ui-font-size-md: 1rem;
  --ui-font-weight-regular: 400;
  --ui-font-weight-semibold: 600;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-border: #3c4749;
  --ui-color-info: #7fb8bd;
  --ui-color-success: #7bbd8b;
  --ui-color-warning: #d6a84f;
  --ui-color-danger: #dd7078;
  --ui-color-gated: #d6a84f;
}

:global(:root[data-ui-theme='light'] .demo-hint-layer--current) {
  color-scheme: light;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-info: #4d8793;
  --ui-color-success: #5f9a72;
  --ui-color-warning: #b78336;
  --ui-color-danger: #bd5961;
  --ui-color-gated: #9a6b45;
}

@container (max-width: 48rem) {
  .demo-hint-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

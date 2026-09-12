<script setup>
import UiNotice from '../ui/UiNotice.vue';
import DemoCandidateNotice from './DemoCandidateNotice.vue';
import DemoNoticeNotificationRecipe from './DemoNoticeNotificationRecipe.vue';
import DemoNoticePrimitive from './DemoNoticePrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 UiNotice · 內嵌通知',
    note: '靠近相關內容的結構化訊息；圖示、標題／說明與選用操作共同表達一件事，是否即時宣告由使用畫面決定。',
    component: DemoCandidateNotice,
    densities: [
      {
        id: 'standard',
        label: 'Standard · 12px inset／36px action',
      },
      { id: 'compact', label: 'Compact · 8px inset／32px action' },
    ],
  },
  {
    key: 'current',
    title: '現行 UiNotice',
    note: '以現行樣式呈現中性／四種狀態色、12／8px 內距、30px 操作高度與既有的自動宣告語意。',
    component: UiNotice,
    densities: [
      {
        id: 'standard',
        label: 'Current Standard · 12px inset／30px action',
        compact: false,
      },
      {
        id: 'compact',
        label: 'Current Compact · 8px inset／30px action',
        compact: true,
      },
    ],
  },
];
</script>

<template>
  <div class="demo-notice-appearance">
    <p class="demo-notice-appearance__intro">
      <strong>UiNotice 保留為共用的結構化內嵌通知。</strong>
      跨功能的使用數量只證明有共用需求，不能單獨決定元件歸屬。是否使用它取決於訊息與內容的關係、組成與顯示時間；固定通知由外層通知容器負責。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-notice-layer"
      :class="`demo-notice-layer--${layer.key}`"
      :data-notice-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-notice-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoNoticePrimitive :layer="layer" />
      <DemoNoticeNotificationRecipe :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-notice-appearance,
.demo-notice-layer {
  min-width: 0;
  display: grid;
}

.demo-notice-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-notice-appearance__intro,
.demo-notice-layer__header h4,
.demo-notice-layer__header p {
  margin: 0;
}

.demo-notice-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-notice-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-notice-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-notice-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-notice-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-notice-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-notice-layer--current {
  color-scheme: dark;
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-space-3: 0.75rem;
  --ui-space-4: 1rem;
  --ui-space-5: 1.5rem;
  --ui-border-width: 1px;
  --ui-focus-width: 2px;
  --ui-focus-offset: 2px;
  --ui-radius-md: 0.375rem;
  --ui-radius-lg: 0.5rem;
  --ui-control-height: 1.875rem;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-font-size-sm: 0.875rem;
  --ui-font-weight-regular: 400;
  --ui-font-weight-semibold: 600;
  --ui-line-height-label: 1.25;
  --ui-line-height-caption: 1.4;
  --ui-motion-duration-feedback: 100ms;
  --ui-motion-easing-standard: ease-out;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-border: #3c4749;
  --ui-color-focus: #dd7a64;
  --ui-color-info: #7fb8bd;
  --ui-color-success: #7bbd8b;
  --ui-color-warning: #d6a84f;
  --ui-color-danger: #dd7078;
  --ui-color-info-soft: color-mix(in srgb, #7fb8bd 18%, transparent);
  --ui-color-success-soft: color-mix(in srgb, #7bbd8b 18%, transparent);
  --ui-color-warning-soft: color-mix(in srgb, #d6a84f 18%, transparent);
  --ui-color-danger-soft: color-mix(in srgb, #dd7078 18%, transparent);
}

:global(:root[data-ui-theme='light'] .demo-notice-layer--current) {
  color-scheme: light;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-focus: #d26a45;
  --ui-color-info: #4d8793;
  --ui-color-success: #5f9a72;
  --ui-color-warning: #b78336;
  --ui-color-danger: #bd5961;
  --ui-color-info-soft: color-mix(in srgb, #4d8793 18%, transparent);
  --ui-color-success-soft: color-mix(in srgb, #5f9a72 18%, transparent);
  --ui-color-warning-soft: color-mix(in srgb, #b78336 18%, transparent);
  --ui-color-danger-soft: color-mix(in srgb, #bd5961 18%, transparent);
}

@container (max-width: 48rem) {
  .demo-notice-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

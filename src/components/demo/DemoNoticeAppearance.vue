<script setup>
import DemoCandidateNotice from './DemoCandidateNotice.vue';
import DemoNoticeNotificationRecipe from './DemoNoticeNotificationRecipe.vue';
import DemoNoticePrimitive from './DemoNoticePrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 UiNotice · 內嵌通知',
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-notice-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-notice-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

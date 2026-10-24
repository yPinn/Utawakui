<script setup>
import DemoCandidateNotice from './DemoCandidateNotice.vue';
import DemoNoticeNotificationRecipe from './DemoNoticeNotificationRecipe.vue';
import DemoNoticePrimitive from './DemoNoticePrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 · 內嵌通知',
    note: '圖示、訊息與選用操作；此提案的宣告方式與正式元件不同。',
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
      靠近相關內容顯示訊息與操作；固定通知另由通知容器管理。
    </p>

    <DemoNoticeNotificationRecipe />

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

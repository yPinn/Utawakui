<script setup>
import DemoCandidateHint from './DemoCandidateHint.vue';
import DemoHintPrimitive from './DemoHintPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 UiHint · 輔助文字',
    note: '用於獨立、非互動且可自然換行的短說明；欄位關聯、即時宣告與位置由所在畫面決定。',
    component: DemoCandidateHint,
    densities: [
      ['standard', 'Standard · 14 CSS px／1.4'],
      ['compact', 'Compact · 14 CSS px／1.4'],
    ],
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-hint-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-hint-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

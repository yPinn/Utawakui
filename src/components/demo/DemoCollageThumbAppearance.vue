<script setup>
import DemoCandidateCollageThumb from './DemoCandidateCollageThumb.vue';
import DemoCollageThumbPrimitive from './DemoCollageThumbPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 UiCollageThumb · 集合封面',
    note: '零首與無曲目共用空位置；一首使用完整方形，二至四首才進入等分四格。',
    component: DemoCandidateCollageThumb,
  },
];
</script>

<template>
  <div class="demo-collage-thumb-appearance">
    <p class="demo-collage-thumb-appearance__intro">
      <strong>UiCollageThumb 表示一個集合的封面位置。</strong>
      它把不同來源比例裁進 caller
      指定的正方形，並解析自訂集合封面、單一成員、四格成員拼貼與空集合；內部只共用曲目圖像內容，不承接裁切選擇、單曲
      public contract 或資料列操作。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-collage-thumb-layer"
      :class="`demo-collage-thumb-layer--${layer.key}`"
      :data-collage-thumb-source="layer.key"
    >
      <header class="demo-collage-thumb-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoCollageThumbPrimitive :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-collage-thumb-appearance,
.demo-collage-thumb-layer {
  min-width: 0;
  display: grid;
}

.demo-collage-thumb-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-collage-thumb-appearance__intro,
.demo-collage-thumb-layer__header h4,
.demo-collage-thumb-layer__header p {
  margin: 0;
}

.demo-collage-thumb-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-collage-thumb-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-collage-thumb-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-collage-thumb-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-collage-thumb-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-collage-thumb-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-collage-thumb-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

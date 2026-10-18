<script setup>
import DemoCandidateMarqueeText from './DemoCandidateMarqueeText.vue';
import DemoMarqueeTextPrimitive from './DemoMarqueeTextPrimitive.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 · 過長文字',
    note: '過長文字在指向或聚焦時揭露一次，到達末端後停留；離開後回到開頭。',
    component: DemoCandidateMarqueeText,
    densities: [
      ['standard', 'Standard · 外層 12px inset'],
      ['compact', 'Compact · 外層 8px inset'],
    ],
  },
];
</script>

<template>
  <div class="demo-marquee-appearance">
    <p class="demo-marquee-appearance__intro">單行長文字在指向或聚焦時揭露。</p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-marquee-layer"
      :class="`demo-marquee-layer--${layer.key}`"
      :data-marquee-source="layer.key"
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-marquee-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-marquee-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

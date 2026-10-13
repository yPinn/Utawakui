<script setup>
import DemoActionMenuLayer from './DemoActionMenuLayer.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: '未採用提案 UiActionMenu',
    note: 'Trigger-neutral compound primitive；完整 menu keyboard、viewport collision 與精簡 icon／label／submenu lanes。',
  },
];
</script>

<template>
  <div class="demo-action-menu-appearance">
    <p class="demo-action-menu-appearance__intro">
      <strong>UiActionMenu 是一組短動作的浮動選單。</strong>
      Caller 擁有 Ellipsis／右鍵 trigger、anchor 與產品 action；選單擁有
      item、焦點、碰撞與關閉。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-action-menu-layer"
      :class="`demo-action-menu-layer--${layer.key}`"
      :data-action-menu-source="layer.key"
    >
      <header class="demo-action-menu-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <DemoActionMenuLayer :layer="layer" />
    </section>
  </div>
</template>

<style scoped>
.demo-action-menu-appearance,
.demo-action-menu-layer {
  min-width: 0;
  display: grid;
}

.demo-action-menu-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-action-menu-appearance__intro,
.demo-action-menu-layer__header h4,
.demo-action-menu-layer__header p {
  margin: 0;
}

.demo-action-menu-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-action-menu-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-action-menu-layer {
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-action-menu-layer__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-action-menu-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.demo-action-menu-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-action-menu-layer__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>

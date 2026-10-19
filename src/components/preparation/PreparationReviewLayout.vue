<script setup>
import { useTemplateRef } from 'vue';
import UiHint from '../ui/UiHint.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';

defineProps({
  source: { type: String, required: true },
  count: { type: Number, required: true },
  hint: { type: String, default: '' },
  listLabel: { type: String, default: '曲目' },
});

const scroll = useTemplateRef('scroll');
function scrollTo(...args) {
  scroll.value?.scrollTo(...args);
}
defineExpose({ scrollTo });
</script>

<template>
  <section class="preparation-review-layout">
    <header class="preparation-review-layout__summary">
      <div class="preparation-review-layout__identity">
        <UiHint tone="text">{{ source }} · {{ count }} 首</UiHint>
        <UiHint v-if="hint">{{ hint }}</UiHint>
      </div>
      <div v-if="$slots.actions" class="preparation-review-layout__actions">
        <slot name="actions" />
      </div>
    </header>
    <UiScrollLayout
      ref="scroll"
      class="preparation-review-layout__scroll"
      :aria-label="listLabel"
      tabindex="0"
    >
      <slot />
    </UiScrollLayout>
    <div v-if="$slots.notice" class="preparation-review-layout__notice">
      <slot name="notice" />
    </div>
  </section>
</template>

<style scoped>
.preparation-review-layout {
  /* Modal rows follow the renderer density, with one shared narrow inset.
     Teleport deliberately keeps them outside the Dock's fixed-density map. */
  --ui-track-row-padding-inline: var(--ui-space-1);
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.preparation-review-layout__summary {
  min-inline-size: 0;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.preparation-review-layout__identity {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
  font-variant-numeric: tabular-nums;
}

.preparation-review-layout__actions {
  flex: none;
}

.preparation-review-layout__scroll {
  --ui-scroll-layout-padding-inline-start: var(--ui-space-1);
  --ui-scroll-layout-padding-inline-end: var(--ui-space-1);
  --ui-scroll-layout-padding-block-start: var(--ui-space-1);
  --ui-scroll-layout-padding-block-end: var(--ui-space-1);
  min-block-size: 0;
}

.preparation-review-layout__notice {
  -webkit-user-select: text;
  user-select: text;
}
</style>

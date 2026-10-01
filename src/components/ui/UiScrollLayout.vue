<script setup>
import { computed, useTemplateRef } from 'vue';
import UiScrollRegion from './UiScrollRegion.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  axis: {
    type: String,
    default: 'vertical',
    validator: (value) => ['vertical', 'horizontal', 'both'].includes(value),
  },
  viewportClass: {
    type: [String, Array, Object],
    default: undefined,
  },
  viewportTag: {
    type: String,
    default: 'div',
  },
  viewportStyle: {
    type: [String, Array, Object],
    default: undefined,
  },
  scrollbarVisibility: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'hidden'].includes(value),
  },
  contentTag: {
    type: [String, Object],
    default: 'div',
  },
  contentClass: {
    type: [String, Array, Object],
    default: undefined,
  },
  contentStyle: {
    type: [String, Array, Object],
    default: undefined,
  },
});

const scrollRegion = useTemplateRef('scrollRegion');
const root = computed(() => scrollRegion.value?.root ?? null);
const viewport = computed(() => scrollRegion.value?.viewport ?? null);

function scrollTo(...args) {
  scrollRegion.value?.scrollTo(...args);
}

defineExpose({ root, viewport, scrollTo });
</script>

<template>
  <UiScrollRegion
    ref="scrollRegion"
    v-bind="$attrs"
    class="ui-scroll-layout"
    :axis="props.axis"
    :viewport-class="props.viewportClass"
    :viewport-tag="props.viewportTag"
    :viewport-style="props.viewportStyle"
    :scrollbar-visibility="props.scrollbarVisibility"
    :data-scrollbar-visibility="props.scrollbarVisibility"
  >
    <component
      :is="props.contentTag"
      :class="[props.contentClass, 'ui-scroll-layout__content']"
      :style="props.contentStyle"
    >
      <slot />
    </component>
  </UiScrollRegion>
</template>

<style scoped>
.ui-scroll-layout {
  /* The rail is an overlay hit target. Content geometry only stops at the
     visible thumb's inner edge, not at the transparent start of the rail. */
  --ui-scroll-layout-scrollbar-visual-reserve: calc(
    var(--ui-scrollbar-lane-size) - var(--ui-scrollbar-thumb-inset)
  );
  --ui-scroll-layout-reserve-inline-end: 0rem;
  --ui-scroll-layout-reserve-block-end: 0rem;
}

.ui-scroll-layout[data-scroll-axis='vertical'],
.ui-scroll-layout[data-scroll-axis='both'] {
  --ui-scroll-layout-reserve-inline-end: var(
    --ui-scroll-layout-scrollbar-visual-reserve
  );
}

.ui-scroll-layout[data-scroll-axis='horizontal'],
.ui-scroll-layout[data-scroll-axis='both'] {
  --ui-scroll-layout-reserve-block-end: var(
    --ui-scroll-layout-scrollbar-visual-reserve
  );
}

.ui-scroll-layout[data-scrollbar-visibility='hidden'] {
  --ui-scroll-layout-reserve-inline-end: 0rem;
  --ui-scroll-layout-reserve-block-end: 0rem;
}

.ui-scroll-layout__content {
  box-sizing: border-box;
  min-inline-size: 0;
  padding-block-start: var(--ui-scroll-layout-padding-block-start, 0rem);
  padding-block-end: calc(
    var(--ui-scroll-layout-padding-block-end, 0rem) +
      var(--ui-scroll-layout-reserve-block-end)
  );
  padding-inline-start: var(--ui-scroll-layout-padding-inline-start, 0rem);
  padding-inline-end: calc(
    var(--ui-scroll-layout-padding-inline-end, 0rem) +
      var(--ui-scroll-layout-reserve-inline-end)
  );
}
</style>

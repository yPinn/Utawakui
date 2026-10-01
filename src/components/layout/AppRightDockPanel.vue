<script setup>
import { shallowRef, useTemplateRef } from 'vue';
import AppRightDockHeader from './AppRightDockHeader.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  closeLabel: { type: String, required: true },
  ariaLabel: { type: String, default: '' },
});

const emit = defineEmits(['close']);
const scrollRegion = useTemplateRef('scrollRegion');
const hasScrolled = shallowRef(false);

function updateScrollState(event) {
  hasScrolled.value = event.currentTarget.scrollTop > 0;
}

function scrollTo(...args) {
  scrollRegion.value?.scrollTo(...args);
  const [first, second] = args;
  if (
    (typeof first === 'object' && first?.top === 0) ||
    (first === 0 && second === 0)
  ) {
    hasScrolled.value = false;
  }
}

defineExpose({ scrollTo });
</script>

<template>
  <section class="app-right-dock-panel" :aria-label="ariaLabel || title">
    <slot name="overlay" />

    <div
      class="app-right-dock-panel__chrome"
      :class="{
        'app-right-dock-panel__chrome--scrolled': hasScrolled,
      }"
    >
      <AppRightDockHeader
        :title="props.title"
        :subtitle="props.subtitle"
        :close-label="props.closeLabel"
        @close="emit('close')"
      >
        <template v-if="$slots.identity" #identity>
          <slot name="identity" />
        </template>
      </AppRightDockHeader>
    </div>

    <UiScrollLayout
      ref="scrollRegion"
      class="app-right-dock-panel__scroll"
      axis="vertical"
      @scroll="updateScrollState"
    >
      <div class="app-right-dock-panel__body">
        <slot />
      </div>
    </UiScrollLayout>
  </section>
</template>

<style scoped>
.app-right-dock-panel {
  display: flex;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  flex-direction: column;
  color: var(--ui-color-text);
}

.app-right-dock-panel__chrome {
  position: relative;
  z-index: var(--ui-z-sticky);
  background: var(--ui-right-dock-sticky-background);
  transition:
    box-shadow var(--ui-motion-duration-fast) var(--ui-motion-easing-standard),
    backdrop-filter var(--ui-motion-duration-fast)
      var(--ui-motion-easing-standard);
}

.app-right-dock-panel__chrome--scrolled {
  -webkit-backdrop-filter: blur(var(--ui-right-dock-sticky-blur));
  backdrop-filter: blur(var(--ui-right-dock-sticky-blur));
  box-shadow: var(--ui-right-dock-sticky-shadow);
}

.app-right-dock-panel__scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-right-dock-content-inset);
  --ui-scroll-layout-padding-block-end: var(--ui-right-dock-content-inset);
  --ui-scroll-layout-padding-inline-start: var(--ui-right-dock-content-inset);
  --ui-scroll-layout-padding-inline-end: var(
    --ui-right-dock-track-row-state-surface-outset-inline
  );

  position: relative;
  min-block-size: 0;
  flex: 1;
}

.app-right-dock-panel__body {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-right-dock-section-gap);
}

:global(:root[data-ui-motion='reduced']) .app-right-dock-panel__chrome {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .app-right-dock-panel__chrome {
    transition: none;
  }
}
</style>

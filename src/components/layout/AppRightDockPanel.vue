<script setup>
import { shallowRef, useTemplateRef } from 'vue';
import AppRightDockHeader from './AppRightDockHeader.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSeparator from '../ui/UiSeparator.vue';

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  collapseLabel: { type: String, required: true },
  ariaLabel: { type: String, default: '' },
  workspace: { type: Boolean, default: false },
});

const emit = defineEmits(['collapse']);
const scrollRegion = useTemplateRef('scrollRegion');
const hasScrolled = shallowRef(false);

function updateScrollState(event) {
  hasScrolled.value = event.currentTarget.scrollTop > 0;
}

function scrollTo(...args) {
  scrollRegion.value?.scrollTo(...args);
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
        :collapse-label="props.collapseLabel"
        @collapse="emit('collapse')"
      >
        <template v-if="$slots.identity" #identity>
          <slot name="identity" />
        </template>
        <template v-if="$slots.actions" #actions>
          <slot name="actions" />
        </template>
      </AppRightDockHeader>
      <div v-if="$slots.summary" class="app-right-dock-panel__summary">
        <slot name="summary" />
      </div>
    </div>

    <div v-if="workspace" class="app-right-dock-panel__workspace"><slot /></div>
    <UiScrollLayout
      v-else
      ref="scrollRegion"
      class="app-right-dock-panel__scroll"
      axis="vertical"
      @scroll="updateScrollState"
    >
      <div class="app-right-dock-panel__body">
        <slot />
      </div>
    </UiScrollLayout>
    <footer v-if="$slots.footer" class="app-right-dock-panel__footer">
      <UiSeparator />
      <div class="app-right-dock-panel__footer-content">
        <slot name="footer" />
      </div>
    </footer>
  </section>
</template>

<style scoped>
.app-right-dock-panel {
  isolation: isolate;
  display: flex;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  flex-direction: column;
  color: var(--ui-color-text);
}

.app-right-dock-panel__chrome {
  position: relative;
  z-index: var(--ui-layer-overlay);
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

.app-right-dock-panel__summary {
  padding: var(--ui-space-2) var(--ui-right-dock-content-inset);
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
.app-right-dock-panel__footer {
  flex: 0 0 auto;
  min-inline-size: 0;
}
.app-right-dock-panel__footer-content {
  background: var(--ui-right-dock-footer-background, var(--ui-color-surface));
  padding: var(--ui-space-2) var(--ui-right-dock-content-inset);
}
.app-right-dock-panel__workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-block-size: 0;
  overflow: hidden;
  padding-inline: var(--ui-right-dock-content-inset);
}

:global(:root[data-ui-motion='reduced'] .app-right-dock-panel__chrome) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .app-right-dock-panel__chrome {
    transition: none;
  }
}
</style>

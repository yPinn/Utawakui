<script setup>
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSurface from '../ui/UiSurface.vue';
</script>

<template>
  <UiSurface tag="section" class="app-inner-page" tone="surface" radius="sm">
    <UiScrollLayout
      class="app-inner-page__scroll"
      axis="vertical"
      content-style="block-size: 100%"
    >
      <div class="app-inner-page__content">
        <slot />
      </div>
    </UiScrollLayout>
  </UiSurface>
</template>

<style scoped>
.app-inner-page {
  position: relative;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.app-inner-page__scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-space-4);
  --ui-scroll-layout-padding-block-end: var(--ui-space-4);
  --ui-scroll-layout-padding-inline-start: var(--ui-space-4);
  --ui-scroll-layout-padding-inline-end: var(--ui-space-4);

  height: 100%;
}

/* AppTopTabs.vue tucks under this corner (negative margin + z-index overlap,
   see AppArchiveFrame.vue's .app-archive-frame__tabs) — a rounded top-left
   corner would show a gap/seam where the tabs meet the page. The two-class
   selector (specificity 0,2,0) reliably beats UiSurface's own single-class
   .ui-surface--radius-sm modifier (0,1,0) regardless of CSS bundle order. */
.ui-surface.app-inner-page {
  border-start-start-radius: 0;
}

.app-inner-page__content {
  position: relative;
  z-index: 1;
  min-width: 0;
  /* height (not min-height): lets a view opt into filling exactly the
     available space (flex: 1; min-height: 0 on its own root) for content
     that manages its own internal scrolling, while views that don't opt
     in keep their natural content height and simply overflow into this
     element's scrolling ancestor above. */
  height: 100%;
  display: flex;
  flex-direction: column;
}

@media (max-width: 760px) {
  .app-inner-page__scroll {
    --ui-scroll-layout-padding-block-start: var(--ui-space-3);
    --ui-scroll-layout-padding-block-end: var(--ui-space-3);
    --ui-scroll-layout-padding-inline-start: var(--ui-space-3);
    --ui-scroll-layout-padding-inline-end: var(--ui-space-3);
  }
}
</style>

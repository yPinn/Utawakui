<script setup>
import UiSurface from '../ui/UiSurface.vue';
</script>

<template>
  <UiSurface tag="section" class="app-inner-page" tone="surface" radius="sm">
    <div class="app-inner-page__content">
      <slot />
    </div>
  </UiSurface>
</template>

<style scoped>
.app-inner-page {
  position: relative;
  min-width: 0;
  /* Clamped (not min-height) — this is now the card's own scroll boundary,
     not a box that just grows with its content. Vertical overflow scrolls
     inside this box; horizontal stays clipped to preserve the rounded
     corners. */
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
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
  /* The archive rail overlap belongs to AppArchiveFrame. Content keeps one
     measurable perimeter from the page surface on every side. */
  padding: var(--ui-space-4);
}

@media (max-width: 760px) {
  .app-inner-page__content {
    padding: var(--ui-space-3);
  }
}
</style>

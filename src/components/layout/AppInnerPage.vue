<template>
  <section class="app-inner-page">
    <div class="app-inner-page__content">
      <slot />
    </div>
  </section>
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
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: 0 var(--ui-radius-sm) var(--ui-radius-sm) var(--ui-radius-sm);
  background: var(--ui-color-surface);
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
  padding: calc(var(--ui-archive-rail-size) + var(--ui-space-4))
    var(--ui-space-4) var(--ui-space-4);
}

@media (max-width: 760px) {
  .app-inner-page__content {
    padding: calc(var(--ui-archive-rail-size) + var(--ui-space-3))
      var(--ui-space-3) var(--ui-space-3);
  }
}
</style>

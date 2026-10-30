<script setup>
defineProps({
  title: { type: String, required: true },
  titleLang: { type: String, default: undefined },
  // Shown once the page dossier has scrolled out of the Folder viewport.
  visible: { type: Boolean, default: false },
});
</script>

<template>
  <!-- A zero-height sticky anchor: the bar overlays content instead of
       taking flow space, so revealing it never shifts the document. -->
  <div class="app-folder-compact-bar" :inert="!visible">
    <div
      class="app-folder-compact-bar__surface"
      :class="{ 'app-folder-compact-bar__surface--visible': visible }"
      :aria-hidden="!visible"
    >
      <slot name="action" />
      <span class="app-folder-compact-bar__title" :lang="titleLang">
        {{ title }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.app-folder-compact-bar {
  position: sticky;
  top: 0;
  z-index: var(--ui-layer-overlay);
  block-size: 0;
}

.app-folder-compact-bar__surface {
  position: absolute;
  inset-inline: 0;
  inset-block-start: 0;
  box-sizing: border-box;
  block-size: var(--ui-folder-compact-bar-block-size);
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  /* Block inset only; Play stays on the rail Play's inline edge. */
  padding-block: var(--ui-space-2);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule-strong, var(--ui-color-border));
  background: var(--ui-folder-page-background);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

/* The bar casts the scroll-edge shadow; a stuck table header below covers it. */
.app-folder-compact-bar__surface::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: var(--ui-scroll-edge-shadow-start);
  clip-path: inset(100% 0 calc(-1 * var(--ui-scroll-edge-band-size)) 0);
  pointer-events: none;
}

.app-folder-compact-bar__surface--visible {
  opacity: 1;
  pointer-events: auto;
}

.app-folder-compact-bar__title {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-display);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-title-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Centres the visible ink on the Play button, not the line box. */
  transform: translateY(var(--ui-folder-compact-bar-title-optical-offset));
}
</style>

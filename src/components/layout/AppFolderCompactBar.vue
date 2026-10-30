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
      <div class="app-folder-compact-bar__content">
        <slot name="action" />
        <span class="app-folder-compact-bar__title" :lang="titleLang">
          {{ title }}
        </span>
      </div>
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
  /* Block inset only; Play stays on the rail Play's inline edge. */
  padding-block: var(--ui-space-2);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule-strong, var(--ui-color-border));
  background: var(--ui-folder-page-background);
  /* Toggles in step with the table header's sticky offset; only content fades. */
  visibility: hidden;
  pointer-events: none;
}

.app-folder-compact-bar__surface--visible {
  visibility: visible;
  pointer-events: auto;
}

.app-folder-compact-bar__content {
  block-size: 100%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
  opacity: 0;
}

.app-folder-compact-bar__surface--visible .app-folder-compact-bar__content {
  opacity: 1;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
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

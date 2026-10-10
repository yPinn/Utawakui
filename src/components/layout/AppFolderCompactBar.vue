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
  padding-inline: var(--ui-track-row-padding-inline);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule-strong, var(--ui-color-border));
  background: var(--ui-folder-page-background);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
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
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<script setup>
// Small circular status badge for repeated row-trailing states.
import { ICON_SIZE } from '../../constants/ui.js';

defineProps({
  icon: { type: [Object, Function], required: true },
  // Existing tones only: muted, accent, danger, text, highlight.
  tone: { type: String, default: 'muted' },
  spinning: { type: Boolean, default: false },
  label: { type: String, required: true },
});
</script>

<template>
  <span
    class="ui-status-icon"
    :class="`ui-status-icon--${tone}`"
    :title="label"
    :aria-label="label"
  >
    <component
      :is="icon"
      class="ui-status-icon__glyph"
      :class="{ 'ui-status-icon__glyph--spin': spinning }"
      :size="ICON_SIZE"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.ui-status-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-5);
  height: var(--ui-space-5);
  border-radius: var(--ui-radius-pill);
  /* Not a tokens.css token — a per-context override a parent can set (see
     LyricsWorkspace.vue's .lyrics-row-status) when its own background
     differs from the default contrast target below. Custom properties
     inherit through the DOM, so the scoped-style boundary doesn't block it. */
  background: var(--ui-status-icon-bg, var(--ui-surface-hover));
  color: var(--ui-text-muted);
}

.ui-status-icon--accent {
  color: var(--ui-accent);
}

.ui-status-icon--danger {
  color: var(--ui-danger);
}

.ui-status-icon--text {
  color: var(--ui-text);
}

.ui-status-icon--highlight {
  color: var(--ui-text);
  background: var(--ui-surface-hover);
}

.ui-status-icon__glyph--spin {
  animation: ui-status-icon-spin var(--ui-motion-spin) infinite;
}

@keyframes ui-status-icon-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-status-icon__glyph--spin {
    animation: none;
  }
}
</style>

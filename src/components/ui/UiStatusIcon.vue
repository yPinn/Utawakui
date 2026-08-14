<script setup>
// Small circular status badge for repeated row-trailing states.
import { ICON_SIZE } from '../../icons/index.js';

defineProps({
  icon: { type: [Object, Function], required: true },
  // Existing callers use muted/accent/danger/text/highlight; new states can
  // use info/success/warning/current/gated as the visual language fills in.
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
  background: var(--ui-status-icon-bg, var(--ui-color-surface-hover));
  color: var(--ui-color-text-muted);
}

.ui-status-icon--accent {
  color: var(--ui-color-accent);
}

.ui-status-icon--info {
  color: var(--ui-color-info);
}

.ui-status-icon--success {
  color: var(--ui-color-success);
}

.ui-status-icon--warning {
  color: var(--ui-color-warning);
}

.ui-status-icon--danger {
  color: var(--ui-color-danger);
}

.ui-status-icon--current {
  color: var(--ui-color-current);
  background: var(--ui-color-current-soft);
}

.ui-status-icon--gated {
  color: var(--ui-color-gated);
  background: var(--ui-color-gated-bg);
}

.ui-status-icon--text {
  color: var(--ui-color-text);
}

.ui-status-icon--highlight {
  color: var(--ui-color-text);
  background: var(--ui-color-surface-hover);
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

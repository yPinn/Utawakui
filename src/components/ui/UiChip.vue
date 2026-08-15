<script setup>
// Small pill badge — platform tag, download-mode label, candidate
// confidence/selected marker. background/color default to the "muted
// badge on a canvas-colored panel" case; pass overrides for the surface
// variant or a filled/selected state.
defineProps({
  tone: {
    type: String,
    default: 'muted',
    validator: (value) =>
      [
        'muted',
        'accent',
        'current',
        'info',
        'success',
        'warning',
        'danger',
        'gated',
      ].includes(value),
  },
  background: { type: String, default: undefined },
  color: { type: String, default: undefined },
});
</script>

<template>
  <span
    class="ui-chip"
    :class="`ui-chip--${tone}`"
    :style="{
      '--ui-chip-bg': background,
      '--ui-chip-color': color,
    }"
  >
    <slot />
  </span>
</template>

<style scoped>
.ui-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-chip-bg, var(--ui-chip-tone-bg, var(--ui-color-canvas)));
  color: var(
    --ui-chip-color,
    var(--ui-chip-tone-color, var(--ui-color-text-muted))
  );
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  white-space: nowrap;
}

.ui-chip--accent {
  --ui-chip-tone-bg: var(--ui-color-accent-soft);
  --ui-chip-tone-color: var(--ui-color-accent);
}

.ui-chip--current {
  --ui-chip-tone-bg: var(--ui-color-current-soft);
  --ui-chip-tone-color: var(--ui-color-current);
}

.ui-chip--info {
  --ui-chip-tone-bg: var(--ui-color-accent-soft);
  --ui-chip-tone-color: var(--ui-color-info);
}

.ui-chip--success {
  --ui-chip-tone-bg: var(--ui-color-success-soft);
  --ui-chip-tone-color: var(--ui-color-success);
}

.ui-chip--warning {
  --ui-chip-tone-bg: var(--ui-color-warning-soft);
  --ui-chip-tone-color: var(--ui-color-warning);
}

.ui-chip--danger {
  --ui-chip-tone-bg: var(--ui-color-danger-soft);
  --ui-chip-tone-color: var(--ui-color-danger);
}

.ui-chip--gated {
  --ui-chip-tone-bg: var(--ui-color-gated-bg);
  --ui-chip-tone-color: var(--ui-color-gated);
}
</style>

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
      '--ui-chip-background': background,
      '--ui-chip-color': color,
    }"
  >
    <span class="ui-chip__label"><slot /></span>
  </span>
</template>

<style scoped>
.ui-chip {
  min-width: 0;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(
    --ui-chip-background,
    var(--ui-chip-tone-background, var(--ui-color-canvas))
  );
  color: var(
    --ui-chip-color,
    var(--ui-chip-tone-color, var(--ui-color-text-muted))
  );
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  white-space: nowrap;
}

.ui-chip__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-chip--accent {
  --ui-chip-tone-background: var(--ui-color-accent-soft);
  --ui-chip-tone-color: var(--ui-color-text);
}

.ui-chip--current {
  --ui-chip-tone-background: var(--ui-color-current-soft);
  --ui-chip-tone-color: var(--ui-color-current);
}

.ui-chip--info {
  --ui-chip-tone-background: var(--ui-color-info-soft);
  --ui-chip-tone-color: var(--ui-color-info);
}

.ui-chip--success {
  --ui-chip-tone-background: var(--ui-color-success-soft);
  --ui-chip-tone-color: var(--ui-color-success);
}

.ui-chip--warning {
  --ui-chip-tone-background: var(--ui-color-warning-soft);
  --ui-chip-tone-color: var(--ui-color-warning);
}

.ui-chip--danger {
  --ui-chip-tone-background: var(--ui-color-danger-soft);
  --ui-chip-tone-color: var(--ui-color-danger);
}

.ui-chip--gated {
  --ui-chip-tone-background: var(--ui-color-gated-background);
  --ui-chip-tone-color: var(--ui-color-gated);
}
</style>

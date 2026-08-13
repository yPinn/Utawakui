<script setup>
// Muted/full-strength/danger status text — loading, empty, and error states
// across Setlist/Import/Lyrics/Queue all rendered the same handful of
// declarations independently. `role`/`aria-*` fall through to the root <p>
// automatically (single-root component), so callers still pass
// role="status"/"alert" directly.
defineProps({
  tone: { type: String, default: 'muted' }, // 'muted' | 'text' | 'danger'
  padded: { type: Boolean, default: false },
  center: { type: Boolean, default: false },
});
</script>

<template>
  <p
    class="ui-hint"
    :class="[
      `ui-hint--${tone}`,
      { 'ui-hint--padded': padded, 'ui-hint--center': center },
    ]"
  >
    <slot />
  </p>
</template>

<style scoped>
.ui-hint {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.ui-hint--text {
  color: var(--ui-color-text);
}

.ui-hint--danger {
  color: var(--ui-color-danger);
  font-weight: var(--ui-font-weight-strong);
}

.ui-hint--padded {
  padding: var(--ui-space-4);
}

.ui-hint--center {
  text-align: center;
}
</style>

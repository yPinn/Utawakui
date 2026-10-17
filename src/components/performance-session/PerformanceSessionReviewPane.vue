<script setup>
import UiScrollLayout from '../ui/UiScrollLayout.vue';

defineProps({ bodyLabel: { type: String, required: true } });
</script>

<template>
  <section class="performance-session-review-pane">
    <UiScrollLayout
      class="performance-session-review-pane__scroll"
      viewport-class="performance-session-review-pane__viewport"
      content-class="performance-session-review-pane__content"
      :aria-label="bodyLabel"
      tabindex="0"
    >
      <slot />
    </UiScrollLayout>
    <div v-if="$slots.actions" class="performance-session-review-pane__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.performance-session-review-pane {
  --ui-session-review-inset: var(--ui-space-4);
  --ui-session-review-focus-safe-inset: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-session-review-inset-end: max(
    var(--ui-session-review-inset),
    calc(
      var(--ui-scrollbar-visual-reserve) +
        var(--ui-session-review-focus-safe-inset)
    )
  );

  display: flex;
  flex: 1;
  flex-direction: column;
  min-inline-size: 0;
  min-block-size: 0;
}

.performance-session-review-pane__scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-session-review-inset);
  --ui-scroll-layout-padding-block-end: var(--ui-session-review-inset);
  --ui-scroll-layout-padding-inline-start: var(--ui-session-review-inset);
  --ui-scroll-layout-padding-inline-end: calc(
    var(--ui-session-review-inset-end) -
      var(--ui-scroll-layout-reserve-inline-end)
  );

  flex: 1;
  min-block-size: 0;
}

.performance-session-review-pane__scroll
  :deep(.performance-session-review-pane__viewport) {
  scroll-padding: var(--ui-session-review-inset);
  scroll-padding-inline-end: var(--ui-session-review-inset-end);
}

.performance-session-review-pane__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-3);
  padding-inline: var(--ui-session-review-inset)
    var(--ui-session-review-inset-end);
  border-block-start: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}
</style>

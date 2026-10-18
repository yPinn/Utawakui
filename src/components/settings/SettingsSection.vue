<script setup>
import { useId } from 'vue';

defineProps({ title: { type: String, required: true } });
const headingId = `settings-section-${useId()}`;
</script>

<template>
  <section class="settings-section" :aria-labelledby="headingId">
    <header class="settings-section__header">
      <h2 :id="headingId" class="settings-section__title">{{ title }}</h2>
      <div v-if="$slots.actions" class="settings-section__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="settings-section__content"><slot /></div>
  </section>
</template>

<style scoped>
.settings-section {
  min-inline-size: 0;
  container: settings-section / inline-size;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  scroll-margin-block-start: var(--ui-space-4);
  background: var(--ui-color-surface-raised);
}
.settings-section:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
.settings-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  border-start-start-radius: var(--ui-radius-md);
  border-start-end-radius: var(--ui-radius-md);
  background: var(--ui-color-canvas);
}
.settings-section__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.settings-section__actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.settings-section__content {
  --settings-row-padding-block: var(--ui-space-4);
  --settings-child-padding-block: var(--ui-space-3);
  /* A port holds at most five digits, plus the shared field chrome. */
  --settings-port-inline-size: calc(
    5ch + 2 * var(--ui-field-padding-inline) + 2 * var(--ui-border-width)
  );
  --settings-copy-inset: calc(
    var(--ui-icon-button-size-md) + var(--ui-space-3)
  );
  min-inline-size: 0;
  padding-inline: var(--ui-space-4);
}
@container settings-section (max-width: 48rem) {
  .settings-section__content {
    --settings-row-padding-block: var(--ui-space-3);
    --settings-child-padding-block: var(--ui-space-2);
  }
}
.settings-section__content > :deep(* + *) {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.settings-section__content
  :deep(.settings-section__disclosure > .ui-disclosure__summary) {
  display: grid;
  grid-template-columns: var(--ui-icon-button-size-md) minmax(0, 1fr);
  gap: var(--ui-space-3);
  padding-inline: 0;
}
.settings-section__content
  :deep(
    .settings-section__disclosure
      > .ui-disclosure__summary
      > .ui-disclosure__indicator
  ) {
  justify-self: center;
}
.settings-section__content
  :deep(.settings-section__disclosure > .ui-disclosure__body) {
  padding: 0;
}
</style>

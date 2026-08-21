<script setup>
import { computed } from 'vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  status: { type: String, default: '' },
  statusTone: { type: String, default: 'muted' },
});

const headingId = computed(
  () => `${props.title.toLowerCase().replace(/\s+/g, '-')}-settings-title`,
);
</script>

<template>
  <section class="settings-block" :aria-labelledby="headingId">
    <header class="settings-block__header">
      <div class="settings-block__copy">
        <h2 :id="headingId" class="settings-block__title">{{ title }}</h2>
        <p v-if="summary" class="settings-block__summary">
          {{ summary }}
        </p>
      </div>
      <div class="settings-block__actions">
        <UiChip v-if="status" :tone="statusTone">{{ status }}</UiChip>
        <slot name="actions" />
      </div>
    </header>
    <div class="settings-block__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-block {
  min-width: 0;
  display: grid;
  gap: var(--ui-settings-block-gap);
  padding: var(--ui-settings-block-padding);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.settings-block__header,
.settings-block__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  min-width: 0;
}

.settings-block__copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.settings-block__title,
.settings-block__summary {
  margin: 0;
}

.settings-block__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.settings-block__summary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.settings-block__actions {
  flex: 0 0 auto;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.settings-block__body {
  min-width: 0;
  display: grid;
  gap: var(--ui-settings-block-body-gap);
}

@media (max-width: 680px) {
  .settings-block__header {
    align-items: stretch;
    flex-direction: column;
  }

  .settings-block__actions {
    justify-content: flex-start;
  }
}
</style>

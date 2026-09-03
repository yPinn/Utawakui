<script setup>
defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  componentLabel: { type: String, default: '' },
});
</script>

<template>
  <section class="demo-catalogue-section" :aria-labelledby="`${id}-title`">
    <header class="demo-catalogue-section__header">
      <h3 :id="`${id}-title`" class="demo-catalogue-section__title">
        {{ title }}
      </h3>
      <code v-if="componentLabel" class="demo-catalogue-section__component">
        {{ componentLabel }}
      </code>
    </header>
    <div class="demo-catalogue-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.demo-catalogue-section {
  display: grid;
  grid-template-columns: minmax(8.5rem, 11rem) minmax(0, 1fr);
  gap: var(--ui-space-5);
  padding: var(--ui-space-5) 0;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-catalogue-section__header {
  min-width: 0;
  align-self: start;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-catalogue-section__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-catalogue-section__component {
  overflow: hidden;
  color: var(--ui-color-text-subtle);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-catalogue-section__body {
  min-width: 0;
}

.demo-catalogue-section__body :deep(.demo-sample-row) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-catalogue-section__body :deep(.demo-sample-stack) {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.demo-catalogue-section__body :deep(.demo-sample-grid) {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
  gap: var(--ui-space-4);
}

.demo-catalogue-section__body :deep(.demo-sample-state) {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}

.demo-catalogue-section__body :deep(.demo-sample-state__label),
.demo-catalogue-section__body :deep(.demo-sample-caption) {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-catalogue-section__body :deep(.demo-sample-state__label) {
  font-weight: var(--ui-font-weight-semibold);
}

.demo-catalogue-section__body :deep(.demo-sample-surface) {
  min-width: 0;
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-lg);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-raised) 82%,
    transparent
  );
}

@media (max-width: 58rem) {
  .demo-catalogue-section {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-3);
  }
}
</style>

<script setup>
defineProps({
  title: { type: String, required: true },
  context: { type: String, default: '' },
});
</script>

<template>
  <div class="obs-inspector-header">
    <div class="obs-inspector-header__labels">
      <h2 class="obs-inspector-header__title">{{ title }}</h2>
      <p v-if="context" class="obs-inspector-header__context">{{ context }}</p>
    </div>
    <div v-if="$slots.actions" class="obs-inspector-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.obs-inspector-header {
  min-inline-size: 0;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-inspector-header__labels {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
  overflow-wrap: anywhere;
}

.obs-inspector-header__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.obs-inspector-header__context {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.obs-inspector-header__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}
</style>

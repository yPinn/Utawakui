<script setup>
import { computed } from 'vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  activeId: { type: String, default: null },
  ariaLabel: { type: String, required: true },
  tabIdPrefix: { type: String, required: true },
  panelIdPrefix: { type: String, default: '' },
  variant: {
    type: String,
    default: 'panel',
    validator: (value) => ['panel', 'bar'].includes(value),
  },
});

const emit = defineEmits(['update:activeId']);

const listClasses = computed(() => [
  'obs-output-tabs',
  `obs-output-tabs--${props.variant}`,
]);

function tabId(item) {
  return `${props.tabIdPrefix}-${item.id}-tab`;
}

function panelId(item) {
  if (!props.panelIdPrefix) return null;
  return `${props.panelIdPrefix}-${item.id}-panel`;
}

function selectItem(item) {
  if (item.disabled || item.id === props.activeId) return;
  emit('update:activeId', item.id);
}
</script>

<template>
  <div :class="listClasses" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="item in items"
      :id="tabId(item)"
      :key="item.id"
      type="button"
      class="obs-output-tabs__item"
      :class="{ 'obs-output-tabs__item--active': item.id === activeId }"
      role="tab"
      :aria-selected="item.id === activeId"
      :aria-controls="panelId(item)"
      :aria-disabled="item.disabled || undefined"
      :disabled="item.disabled"
      :tabindex="item.id === activeId ? 0 : -1"
      @click="selectItem(item)"
    >
      <span class="obs-output-tabs__label">{{ item.label }}</span>
      <UiChip v-if="item.count != null" tone="muted">
        {{ item.count }}
      </UiChip>
    </button>
  </div>
</template>

<style scoped>
.obs-output-tabs {
  min-width: 0;
  display: flex;
  gap: var(--ui-space-1);
  overflow-x: auto;
}

.obs-output-tabs--panel {
  display: inline-flex;
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.obs-output-tabs__item {
  min-height: var(--ui-control-height);
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding-inline: var(--ui-space-3);
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  white-space: nowrap;
  cursor: pointer;
}

.obs-output-tabs__item:hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.obs-output-tabs__item:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-output-tabs__item:disabled {
  cursor: default;
  opacity: var(--ui-opacity-disabled);
}

.obs-output-tabs__item--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.obs-output-tabs__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

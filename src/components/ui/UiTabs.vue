<script setup>
import { computed, nextTick, useTemplateRef } from 'vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
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
const tabRefs = useTemplateRef('tabs');

const enabledItems = computed(() =>
  props.items.filter((item) => !item.disabled),
);
const focusId = computed(() =>
  enabledItems.value.some((item) => item.id === props.activeId)
    ? props.activeId
    : enabledItems.value[0]?.id,
);

function tabId(item) {
  return `${props.tabIdPrefix}-${item.id}-tab`;
}

function panelId(item) {
  return props.panelIdPrefix
    ? `${props.panelIdPrefix}-${item.id}-panel`
    : undefined;
}

function select(item) {
  if (!item.disabled && item.id !== props.activeId) {
    emit('update:activeId', item.id);
  }
}

function moveFocus(item, event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key) || enabledItems.value.length === 0) return;
  event.preventDefault();

  const currentIndex = Math.max(
    0,
    enabledItems.value.findIndex((candidate) => candidate.id === item.id),
  );
  let targetIndex = currentIndex;
  if (event.key === 'ArrowLeft') {
    targetIndex =
      (currentIndex - 1 + enabledItems.value.length) %
      enabledItems.value.length;
  } else if (event.key === 'ArrowRight') {
    targetIndex = (currentIndex + 1) % enabledItems.value.length;
  } else if (event.key === 'Home') {
    targetIndex = 0;
  } else if (event.key === 'End') {
    targetIndex = enabledItems.value.length - 1;
  }

  const target = enabledItems.value[targetIndex];
  select(target);
  nextTick(() => {
    const sourceIndex = props.items.findIndex(
      (candidate) => candidate.id === target.id,
    );
    tabRefs.value?.[sourceIndex]?.focus();
  });
}
</script>

<template>
  <div
    class="ui-tabs"
    :class="`ui-tabs--${variant}`"
    role="tablist"
    :aria-label="ariaLabel"
  >
    <button
      v-for="item in items"
      :id="tabId(item)"
      :key="item.id"
      ref="tabs"
      type="button"
      class="ui-tabs__tab"
      :class="{ 'is-active': item.id === activeId }"
      role="tab"
      :aria-selected="item.id === activeId"
      :aria-controls="panelId(item)"
      :disabled="item.disabled"
      :aria-disabled="item.disabled || undefined"
      :tabindex="item.id === focusId ? 0 : -1"
      @click="select(item)"
      @keydown="moveFocus(item, $event)"
    >
      <slot name="label" :item="item">{{ item.label }}</slot>
      <slot name="after" :item="item" />
    </button>
  </div>
</template>

<style scoped>
.ui-tabs {
  min-width: 0;
  display: flex;
  gap: var(--ui-space-1);
  overflow-x: auto;
}

.ui-tabs--panel {
  display: inline-flex;
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-canvas);
}

.ui-tabs__tab {
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
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

.ui-tabs__tab:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.ui-tabs__tab:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-tabs__tab:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-tabs__tab.is-active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}
</style>

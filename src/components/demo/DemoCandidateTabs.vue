<script setup>
import { useAttrs } from 'vue';
import UiTabs from '../ui/UiTabs.vue';

defineOptions({ inheritAttrs: false });

defineProps({
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

defineEmits(['update:activeId']);

const attrs = useAttrs();
</script>

<template>
  <div class="demo-candidate-tabs">
    <UiTabs
      v-bind="attrs"
      :items="items"
      :active-id="activeId"
      :aria-label="ariaLabel"
      :tab-id-prefix="tabIdPrefix"
      :panel-id-prefix="panelIdPrefix"
      :variant="variant"
      @update:active-id="$emit('update:activeId', $event)"
    >
      <template #label="{ item }">
        <span class="demo-candidate-tabs__label">
          <slot name="label" :item="item">{{ item.label }}</slot>
        </span>
      </template>
      <template #after="{ item }">
        <slot name="after" :item="item" />
      </template>
    </UiTabs>
  </div>
</template>

<style scoped>
.demo-candidate-tabs {
  min-width: 0;
  max-width: 100%;
  display: flex;
  container-type: inline-size;
}

.demo-candidate-tabs :deep(.ui-tabs) {
  box-sizing: border-box;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-color: var(--ui-color-border-strong) transparent;
  scrollbar-width: thin;
}

.demo-candidate-tabs :deep(.ui-tabs--panel) {
  width: fit-content;
}

.demo-candidate-tabs :deep(.ui-tabs--bar) {
  width: 100%;
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-candidate-tabs :deep(.ui-tabs__tab) {
  position: relative;
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  min-height: var(--demo-tabs-height, var(--ui-control-height));
  flex: 0 0 auto;
  overflow: hidden;
  padding-inline: var(--ui-space-3);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-candidate-tabs__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-candidate-tabs :deep(.ui-tabs__tab:active:not(:disabled)) {
  background: var(--ui-color-surface-active);
  color: var(--ui-color-text);
}

.demo-candidate-tabs :deep(.ui-tabs__tab:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-candidate-tabs :deep(.ui-tabs--panel .ui-tabs__tab.is-active) {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.demo-candidate-tabs
  :deep(.ui-tabs--panel .ui-tabs__tab.is-active:hover:not(:disabled)) {
  background: color-mix(
    in srgb,
    var(--ui-color-surface-selected) 82%,
    var(--ui-color-surface-hover)
  );
  color: var(--ui-color-accent-hover);
}

.demo-candidate-tabs :deep(.ui-tabs--bar .ui-tabs__tab) {
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
}

.demo-candidate-tabs :deep(.ui-tabs--bar .ui-tabs__tab.is-active) {
  background: transparent;
  color: var(--ui-color-accent);
}

.demo-candidate-tabs :deep(.ui-tabs--bar .ui-tabs__tab.is-active::after) {
  position: absolute;
  right: var(--ui-space-2);
  bottom: 0;
  left: var(--ui-space-2);
  height: 2px;
  border-radius: var(--ui-radius-pill) var(--ui-radius-pill) 0 0;
  background: currentColor;
  content: '';
}

.demo-candidate-tabs
  :deep(.ui-tabs--bar .ui-tabs__tab.is-active:hover:not(:disabled)) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-accent-hover);
}

.demo-candidate-tabs :deep(.ui-tabs__tab:disabled) {
  opacity: var(--ui-opacity-disabled);
}
</style>

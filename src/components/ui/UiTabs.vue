<script setup>
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import UiScrollLayout from './UiScrollLayout.vue';

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
  distribution: {
    type: String,
    default: 'content',
    validator: (value) => ['content', 'equal'].includes(value),
  },
});

const emit = defineEmits(['update:activeId']);
const tabRefs = new Map();
const groupRef = useTemplateRef('group');

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

function setOptionRef(id, element) {
  if (element) tabRefs.set(id, element);
  else tabRefs.delete(id);
}

// Preserve an existing keyboard owner when a focused item disappears or disables.
// Selection remains caller-owned; updates outside this group never steal focus.
watch(enabledItems, () => {
  const document = globalThis.document;
  const active = document?.activeElement;
  const focused = [...tabRefs].find(([, element]) => element === active);
  if (
    !focused ||
    enabledItems.value.some((item) => Object.is(item.id, focused[0]))
  )
    return;
  nextTick(() => {
    if (
      document.activeElement === active ||
      document.activeElement === document.body
    ) {
      tabRefs.get(focusId.value)?.focus();
    }
  });
});

function select(item) {
  if (!item.disabled && item.id !== props.activeId) {
    emit('update:activeId', item.id);
  }
}

function moveFocus(item, event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (
    item.disabled ||
    !keys.includes(event.key) ||
    enabledItems.value.length === 0
  )
    return;
  event.preventDefault();

  const currentIndex = Math.max(
    0,
    enabledItems.value.findIndex((candidate) => candidate.id === item.id),
  );
  let targetIndex = currentIndex;
  const rtl =
    typeof globalThis.getComputedStyle === 'function' &&
    globalThis.getComputedStyle(groupRef.value).direction === 'rtl';
  if (
    (event.key === 'ArrowLeft' && !rtl) ||
    (event.key === 'ArrowRight' && rtl)
  ) {
    targetIndex =
      (currentIndex - 1 + enabledItems.value.length) %
      enabledItems.value.length;
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    targetIndex = (currentIndex + 1) % enabledItems.value.length;
  } else if (event.key === 'Home') {
    targetIndex = 0;
  } else if (event.key === 'End') {
    targetIndex = enabledItems.value.length - 1;
  }

  const target = enabledItems.value[targetIndex];
  select(target);
  nextTick(() => {
    (tabRefs.get(target.id) || tabRefs.get(focusId.value))?.focus();
  });
}
</script>

<template>
  <div
    ref="group"
    class="ui-tabs"
    :class="[`ui-tabs--${variant}`, `ui-tabs--${distribution}`]"
    role="tablist"
    :aria-label="ariaLabel"
  >
    <UiScrollLayout
      scrollbar-reserve="overflow"
      class="ui-tabs__scroll"
      axis="horizontal"
      content-class="ui-tabs__list"
    >
      <button
        v-for="item in items"
        :id="tabId(item)"
        :key="item.id"
        :ref="(element) => setOptionRef(item.id, element)"
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
        <span class="ui-tabs__label">
          <slot name="label" :item="item">{{ item.label }}</slot>
        </span>
        <slot name="after" :item="item" />
      </button>
    </UiScrollLayout>
  </div>
</template>

<style scoped>
.ui-tabs {
  min-width: 0;
  max-width: 100%;
}

.ui-tabs__scroll {
  --ui-scroll-layout-padding-block-start: 0rem;
  --ui-scroll-layout-padding-block-end: 0rem;
  --ui-scroll-layout-padding-inline-start: 0rem;
  --ui-scroll-layout-padding-inline-end: 0rem;

  max-width: 100%;
}

.ui-tabs__scroll[data-overflow-x='true'] {
  --ui-scroll-layout-padding-block-end: var(--ui-space-1);
}

.ui-tabs__scroll :deep(.ui-tabs__list) {
  display: flex;
  gap: var(--ui-space-1);
}

.ui-tabs--equal {
  display: block;
  width: 100%;
}

.ui-tabs--equal .ui-tabs__scroll {
  width: 100%;
}

.ui-tabs--equal .ui-tabs__scroll :deep(.ui-tabs__list) {
  width: 100%;
}

.ui-tabs--equal .ui-tabs__tab {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
}

.ui-tabs--panel {
  display: inline-block;
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-canvas);
}

.ui-tabs--bar {
  display: block;
  width: 100%;
}

.ui-tabs--bar .ui-tabs__scroll :deep(.ui-tabs__list) {
  gap: 0;
}

.ui-tabs__tab {
  flex: 0 0 auto;
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
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

.ui-tabs__tab:where(:hover:not(:disabled)) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.ui-tabs__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.ui-tabs--bar .ui-tabs__tab {
  position: relative;
  min-inline-size: var(--ui-control-height);
  justify-content: center;
  padding-inline: var(--ui-space-3);
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-tabs--bar .ui-tabs__tab.is-active {
  background: transparent;
  color: var(--ui-color-accent);
}

.ui-tabs--bar .ui-tabs__tab.is-active:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-accent-hover);
}

.ui-tabs--bar .ui-tabs__tab.is-active::after {
  content: '';
  position: absolute;
  right: var(--ui-space-2);
  bottom: 0;
  left: var(--ui-space-2);
  height: var(--ui-border-width-strong);
  border-radius: var(--ui-radius-pill) var(--ui-radius-pill) 0 0;
  background: currentColor;
}
</style>

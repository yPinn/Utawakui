<script setup>
import { computed, nextTick, useTemplateRef } from 'vue';
import UiScrollRegion from './UiScrollRegion.vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  modelValue: { type: [String, Number], default: '' },
  ariaLabel: { type: String, required: true },
  orientation: {
    type: String,
    default: 'horizontal',
    validator: (value) => ['horizontal', 'vertical'].includes(value),
  },
  dir: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'ltr', 'rtl'].includes(value),
  },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const groupRef = useTemplateRef('group');
const optionRefs = useTemplateRef('options');

function itemDisabled(item) {
  return props.disabled || Boolean(item.disabled);
}

const enabledItems = computed(() =>
  props.items.filter((item) => !itemDisabled(item)),
);
const focusId = computed(() =>
  enabledItems.value.some((item) => Object.is(item.id, props.modelValue))
    ? props.modelValue
    : enabledItems.value[0]?.id,
);

function select(item) {
  if (!itemDisabled(item) && !Object.is(item.id, props.modelValue)) {
    emit('update:modelValue', item.id);
  }
}

function resolvedDirection() {
  if (props.dir !== 'auto') return props.dir;
  if (typeof globalThis.getComputedStyle !== 'function') return 'ltr';
  return globalThis.getComputedStyle(groupRef.value).direction === 'rtl'
    ? 'rtl'
    : 'ltr';
}

function moveFocus(item, event) {
  const keys = [
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'Home',
    'End',
  ];
  if (!keys.includes(event.key) || enabledItems.value.length === 0) return;

  event.preventDefault();
  event.stopPropagation();

  const currentIndex = Math.max(
    0,
    enabledItems.value.findIndex((candidate) =>
      Object.is(candidate.id, item.id),
    ),
  );
  const lastIndex = enabledItems.value.length - 1;
  let targetIndex;

  if (event.key === 'Home') {
    targetIndex = 0;
  } else if (event.key === 'End') {
    targetIndex = lastIndex;
  } else {
    const rtl = resolvedDirection() === 'rtl';
    const previous =
      event.key === 'ArrowUp' ||
      (event.key === 'ArrowLeft' && !rtl) ||
      (event.key === 'ArrowRight' && rtl);
    const delta = previous ? -1 : 1;
    targetIndex =
      (currentIndex + delta + enabledItems.value.length) %
      enabledItems.value.length;
  }

  const target = enabledItems.value[targetIndex];
  select(target);
  nextTick(() => {
    const sourceIndex = props.items.findIndex((candidate) =>
      Object.is(candidate.id, target.id),
    );
    optionRefs.value?.[sourceIndex]?.focus();
  });
}
</script>

<template>
  <div
    ref="group"
    class="ui-segmented-control"
    :class="`ui-segmented-control--${orientation}`"
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-orientation="orientation"
    :dir="dir === 'auto' ? undefined : dir"
  >
    <UiScrollRegion
      class="ui-segmented-control__scroll"
      :axis="orientation === 'horizontal' ? 'horizontal' : 'vertical'"
      viewport-class="ui-segmented-control__options"
      :scrollbar-visibility="orientation === 'horizontal' ? 'auto' : 'hidden'"
    >
      <button
        v-for="item in items"
        :key="item.id"
        ref="options"
        type="button"
        class="ui-segmented-control__option"
        :class="{
          'ui-segmented-control__option--selected': Object.is(
            item.id,
            modelValue,
          ),
        }"
        role="radio"
        :aria-checked="Object.is(item.id, modelValue)"
        :aria-disabled="itemDisabled(item) || undefined"
        :disabled="itemDisabled(item)"
        :tabindex="Object.is(item.id, focusId) ? 0 : -1"
        @click="select(item)"
        @keydown="moveFocus(item, $event)"
      >
        <slot name="label" :item="item">{{ item.label }}</slot>
        <slot name="after" :item="item" />
      </button>
    </UiScrollRegion>
  </div>
</template>

<style scoped>
.ui-segmented-control {
  min-width: 0;
  display: inline-block;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-canvas);
}

.ui-segmented-control__scroll {
  max-width: 100%;
}

.ui-segmented-control__scroll :deep(.ui-segmented-control__options) {
  display: flex;
  align-items: stretch;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1);
}

.ui-segmented-control--vertical
  .ui-segmented-control__scroll
  :deep(.ui-segmented-control__options) {
  flex-direction: column;
}

.ui-segmented-control--horizontal {
  max-width: 100%;
}

.ui-segmented-control__option {
  min-width: 0;
  min-height: var(--ui-control-height);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-3);
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

.ui-segmented-control__option:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.ui-segmented-control__option:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-segmented-control__option:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-segmented-control__option--selected {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
  font-weight: var(--ui-font-weight-bold);
}
</style>
